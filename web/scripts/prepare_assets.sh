#!/bin/bash
# 把一套生成好的素材整理成播放器使用的样子。
# 用法：scripts/prepare_assets.sh <素材目录> <房间背景图>
# 例如：scripts/prepare_assets.sh ../pipeline/out/gpt-image-2 ../pipeline/out/room/room.png
# 素材目录里要有：
#   matte/*.webm、matte/*.mov   抠好的透明底片段（pipeline/matte_clips.py 的输出）
#   normalized/*.png            统一好的姿态图
#   motion.json                 走、跑片段的位移数据（pipeline/measure_motion.py 的输出）
set -euo pipefail

SRC="${1:?用法: prepare_assets.sh <素材目录> <房间背景图>}"
ROOM="${2:?用法: prepare_assets.sh <素材目录> <房间背景图>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIPS="$ROOT/assets/clips"
POSES="$ROOT/assets/poses"
mkdir -p "$CLIPS" "$POSES"

# 目标目录里只放这一套，先清掉上一套留下的文件。
find "$CLIPS" -type f \( -name '*.mp4' -o -name '*.webm' -o -name '*.mov' \) -delete
find "$POSES" -type f -name '*.jpg' -delete

cp "$SRC"/matte/*.webm "$SRC"/matte/*.mov "$CLIPS/"
cp "$SRC/motion.json" "$ROOT/assets/motion.json"

for src in "$SRC"/normalized/*.png; do
  ffmpeg -v error -y -i "$src" -vf scale=320:320 -q:v 3 "$POSES/$(basename "${src%.png}").jpg"
done

ffmpeg -v error -y -i "$ROOM" -q:v 2 "$ROOT/assets/room.jpg"

echo "片段：$(ls "$CLIPS"/*.webm | wc -l | tr -d ' ') 段，WebM 合计 $(cat "$CLIPS"/*.webm | wc -c | awk '{printf "%.1f MB", $1/1048576}')，HEVC 合计 $(cat "$CLIPS"/*.mov | wc -c | awk '{printf "%.1f MB", $1/1048576}')"
echo "姿态图：$(ls "$POSES" | tr '\n' ' ')"
