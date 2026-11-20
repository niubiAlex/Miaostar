#!/bin/bash
# 把 45° 小屋这一套素材整理到 web/assets/home45/，供 home.html 使用。
# 用法：scripts/prepare_home45.sh
# pipeline/out/home45/ 里要有：
#   matte/*.webm、matte/*.mov   抠好的透明底片段（pipeline/matte_clips.py 的输出）
#   motion.json                 走的片段的位移数据（pipeline/home45/measure_walk.py 的输出）
#   room_d.png                  小屋背景
#   props/*.png                 窝和碗（pipeline/home45/cut_props.py 的输出）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/../pipeline/out/home45"
OUT="$ROOT/assets/home45"
mkdir -p "$OUT/clips"

# 目标目录里只放这一套，先清掉上一次留下的片段。
CLIPS=(
  walk_fl walk_br walk_bl walk_fr
  turn_fl_to_br turn_br_to_fl turn_fl_to_bl turn_br_to_bl turn_bl_to_fl turn_bl_to_br turn_fr_to_fl turn_fr_to_br
  turn_fl_to_fr
  stand_idle sit_groom stretch loaf_rest sit_watch sniff_ground
  settle_fl sleep_idle wake_up eat_bowl play_ball
  stroll_right stroll_left stroll_up stroll_down stroll_front stroll_back petted called scratch
)
find "$OUT/clips" -type f \( -name '*.webm' -o -name '*.mov' \) -delete
for name in "${CLIPS[@]}"; do
  cp "$SRC/matte/$name.webm" "$SRC/matte/$name.mov" "$OUT/clips/"
done
cp "$SRC/motion.json" "$OUT/motion.json"
# 溜达片段的起点和位移、吃饭片段里碗的位置（pipeline/home45/make_extra_poses.py 的输出）。
cp "$SRC/extra_poses.json" "$OUT/extra_poses.json"
ffmpeg -v error -y -i "$SRC/room_d.png" -q:v 2 "$OUT/room.jpg"
# 道具在页面上最宽 150 像素左右，按两倍屏留够就行。
ffmpeg -v error -y -i "$SRC/props/bed.png" -vf scale=420:-1 "$OUT/bed.png"
ffmpeg -v error -y -i "$SRC/props/board.png" -vf scale=300:-1 "$OUT/board.png"
# 家里不放猫砂盆了（它出门上厕所），上厕所的片段也不带。
rm -f "$OUT/mat.png" "$OUT/litter_box.png" "$OUT"/clips/litter*
# 门所在的那面墙，门洞挖空。
"$ROOT/../.venv/bin/python" "$ROOT/../pipeline/home45/door_cover.py" "$OUT/room.jpg" "$OUT/door_cover.png"
ffmpeg -v error -y -i "$SRC/props/bowl_full.png" -vf scale=160:-1 "$OUT/bowl_full.png"
ffmpeg -v error -y -i "$SRC/props/bowl_empty.png" -vf scale=160:-1 "$OUT/bowl_empty.png"

echo "片段：$(ls "$OUT"/clips/*.webm | wc -l | tr -d ' ') 段，WebM 合计 $(cat "$OUT"/clips/*.webm | wc -c | awk '{printf "%.1f MB", $1/1048576}')，HEVC 合计 $(cat "$OUT"/clips/*.mov | wc -c | awk '{printf "%.1f MB", $1/1048576}')"
