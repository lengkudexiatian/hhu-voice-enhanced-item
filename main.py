"""
VoiceEnhance - 语音超分辨率训练脚本
GPU 训练版 · 含完整权重保存
"""
import os
import time
import logging
import torch
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm
import torchaudio

from speech_enhance_function.loss import get_losses
from speech_enhance_function.metrics import get_metrics
from speech_enhance_function.dataloader import create_dataloaders
from speech_enhance_function.model import AudioRestorationModel


# ==================== 日志 ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("train")


# ==================== 训练配置 ====================
class TrainingConfig:
    # 路径参数
    de_root = "./data_8_de"          # 8kHz 输入
    ta_root = "./data_16_r"          # 16kHz 目标
    save_root = "./output"           # 权重保存

    # 音频处理参数
    sr = 8000
    n_fft = 512
    hop_length = 64
    win_length = 256
    audio_ext = ".wav"

    # 训练参数
    batch_size = 4                  # 显存不够改 8 或 4
    epochs = 50
    learning_rate = 1e-4
    weight_decay = 1e-5
    train_ratio = 0.9
    val_interval = 1
    save_interval = 5
    grad_clip = 5.0

    # 系统参数
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    num_workers = 0                  # Windows 建议 0，Linux 可设 4
    seed = 42

    # 优化器
    optimizer = "adam"


# ==================== 训练流程 ====================
def train_model(config):
    torch.manual_seed(config.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(config.seed)

    logger.info("=" * 65)
    logger.info("  VoiceEnhance 训练启动")
    logger.info("=" * 65)
    logger.info(f"  设备: {config.device}")
    if torch.cuda.is_available():
        logger.info(f"  GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"  显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    logger.info(f"  Batch Size: {config.batch_size}")
    logger.info(f"  Epochs: {config.epochs}")
    logger.info(f"  学习率: {config.learning_rate}")
    logger.info("=" * 65)

    # 初始化模型
    model = AudioRestorationModel(config).to(config.device)
    total_params = sum(p.numel() for p in model.parameters())
    logger.info(f"  模型参数量: {total_params:,}")

    # 数据加载器
    train_loader, val_loader = create_dataloaders(config)
    logger.info(f"  训练集: {len(train_loader.dataset)} 条 | 验证集: {len(val_loader.dataset)} 条")

    # 优化器
    if config.optimizer.lower() == "adam":
        optimizer = optim.Adam(
            model.parameters(),
            lr=config.learning_rate,
            weight_decay=config.weight_decay
        )
    else:
        optimizer = optim.SGD(
            model.parameters(),
            lr=config.learning_rate,
            momentum=0.9,
            weight_decay=config.weight_decay
        )

    # 学习率调度器
    scheduler = CosineAnnealingLR(optimizer, T_max=config.epochs, eta_min=1e-6)

    # 保存目录
    os.makedirs(config.save_root, exist_ok=True)

    # 最佳验证损失
    best_val_loss = float('inf')
    overall_start = time.time()

    # ========== 开始训练 ==========
    logger.info("\n开始训练...\n")

    for epoch in range(config.epochs):
        epoch_start = time.time()

        # -------- 训练阶段 --------
        model.train()
        train_loss = 0.0
        n_batches = len(train_loader)

        train_loop = tqdm(
            train_loader,
            desc=f"Epoch {epoch + 1:03d}/{config.epochs} [Train]",
            bar_format="{l_bar}{bar:30}{r_bar}",
            ncols=110
        )

        for batch_idx, (de_wav, ta_wav, filenames, _) in enumerate(train_loop):
            de_wav = de_wav.to(config.device, non_blocking=True)
            ta_wav = ta_wav.to(config.device, non_blocking=True)

            optimizer.zero_grad()
            pr_wav = model(de_wav)
            loss = get_losses(ta_wav, pr_wav)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), config.grad_clip)
            optimizer.step()

            train_loss += loss.item()
            avg_loss = train_loss / (batch_idx + 1)
            current_lr = optimizer.param_groups[0]['lr']

            train_loop.set_postfix({
                "loss": f"{loss.item():.4f}",
                "avg": f"{avg_loss:.4f}",
                "lr": f"{current_lr:.2e}"
            })

        avg_train_loss = train_loss / n_batches
        train_loop.close()

        # -------- 验证阶段 --------
        avg_val_loss = None
        avg_LSD = None
        if (epoch + 1) % config.val_interval == 0:
            model.eval()
            val_loss = 0.0
            LSD = 0.0

            with torch.no_grad():
                val_loop = tqdm(
                    val_loader,
                    desc=f"Epoch {epoch + 1:03d}/{config.epochs} [Val]  ",
                    bar_format="{l_bar}{bar:30}{r_bar}",
                    ncols=110,
                    leave=False
                )

                for val_batch_idx, (de_wav, ta_wav, filenames, wav_lens) in enumerate(val_loop):
                    de_wav = de_wav.to(config.device, non_blocking=True)
                    ta_wav = ta_wav.to(config.device, non_blocking=True)

                    pr_wav = model(de_wav)
                    val_loss += get_losses(ta_wav, pr_wav).item()
                    LSD += get_metrics(ta_wav.cpu(), pr_wav.cpu())

                    val_loop.set_postfix({
                        "progress": f"{(val_batch_idx + 1) / len(val_loader):.0%}"
                    })

                    # 保存部分预测音频
                    save_dir = os.path.join(config.save_root, "samples")
                    os.makedirs(save_dir, exist_ok=True)
                    for i in range(min(2, pr_wav.size(0))):
                        original_len = wav_lens[i]
                        audio_tensor = pr_wav[i][:, :original_len].cpu()
                        save_path = os.path.join(save_dir, f"epoch{epoch+1:03d}_{os.path.basename(filenames[i])}")
                        try:
                            torchaudio.save(save_path, audio_tensor, config.sr)
                        except Exception:
                            pass

            avg_val_loss = val_loss / len(val_loader)
            avg_LSD = LSD / len(val_loader)
            val_loop.close()

        # -------- 更新学习率 --------
        scheduler.step()

        # -------- Epoch 日志 --------
        epoch_time = time.time() - epoch_start
        log_msg = f"Epoch [{epoch + 1:03d}/{config.epochs}] | 训练Loss: {avg_train_loss:.4f}"
        if avg_val_loss is not None:
            log_msg += f" | 验证Loss: {avg_val_loss:.4f} | LSD: {avg_LSD:.4f}"
        log_msg += f" | LR: {optimizer.param_groups[0]['lr']:.2e} | 耗时: {epoch_time:.1f}s"
        logger.info(log_msg)

        # -------- 保存检查点（定期） --------
        if (epoch + 1) % config.save_interval == 0:
            ckpt_path = os.path.join(config.save_root, f"checkpoint_epoch_{epoch+1}.pth")
            torch.save({
                'epoch': epoch,
                'model': model.state_dict(),
                'optimizer': optimizer.state_dict(),
                'train_loss': avg_train_loss,
                'val_loss': avg_val_loss,
                'best_val_loss': best_val_loss
            }, ckpt_path)
            logger.info(f"  [保存] 检查点: {ckpt_path}")

        # -------- 保存最佳模型 --------
        if avg_val_loss is not None and avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            best_path = os.path.join(config.save_root, "best_model.pth")
            torch.save(model.state_dict(), best_path)
            logger.info(f"  [最佳] Val Loss={avg_val_loss:.4f} → {best_path}")

        # -------- 保存最新权重 --------
        latest_path = os.path.join(config.save_root, "latest.pth")
        torch.save(model.state_dict(), latest_path)

    # ========== 训练完成 ==========
    total_time = (time.time() - overall_start) / 3600
    logger.info("\n" + "=" * 65)
    logger.info("  训练完成！")
    logger.info("=" * 65)
    logger.info(f"  总耗时: {total_time:.2f} 小时")
    logger.info(f"  最佳验证 Loss: {best_val_loss:.4f}")
    logger.info(f"  最佳模型: {os.path.join(config.save_root, 'best_model.pth')}")
    logger.info(f"  最新权重: {os.path.join(config.save_root, 'latest.pth')}")
    logger.info("=" * 65)


# ==================== 主程序 ====================
if __name__ == "__main__":
    config = TrainingConfig()

    assert os.path.exists(config.de_root), f"8kHz 目录不存在: {config.de_root}"
    assert os.path.exists(config.ta_root), f"16kHz 目录不存在: {config.ta_root}"

    train_model(config)