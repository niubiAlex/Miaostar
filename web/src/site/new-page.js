// 送它来喵星：收照片和信息，先存在本机浏览器，跳到它的主页。
// 云端生成接上后，这里会上传照片并创建小屋。
import { addCat, login, me, renderHeader, slugTaken } from './store.js';

// 这些地址网站自己要用，不能当猫的主页名。
const RESERVED = new Set(['cats', 'new', 'home', 'me', 'assets', 'src', 'site', 'concepts', 'scripts', 'vendor', 'api',
  'login', 'admin']);
const PHOTO_SIZE = 512; // 存进浏览器前缩到这么大，不然存不下
const MAX_PHOTOS = 5;

const form = document.getElementById('form');
const errorBox = document.getElementById('error');
let photos = [];

if (me()) form.owner.value = me().name;

function shrink(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, PHOTO_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

form.photos.addEventListener('change', async () => {
  photos = await Promise.all([...form.photos.files].slice(0, MAX_PHOTOS).map(shrink));
  document.getElementById('photoPreview').innerHTML = photos.map((src) => `<img src="${src}" alt="" />`).join('');
});

function problem(data) {
  if (photos.length === 0) return '请至少上传一张它的照片';
  if (!data.name) return '请写上它的名字';
  if (!data.owner) return '请写上你的名字';
  if (!/^[a-z0-9-]{2,24}$/.test(data.slug)) return '主页地址只能用小写字母、数字和短横线，2 到 24 个字';
  if (RESERVED.has(data.slug) || slugTaken(data.slug)) return `喵星/${data.slug} 已经有猫住了，换一个吧`;
  if (!data.planetDay) return '请选择它来到喵星的日子';
  return null;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries([...new FormData(form)].filter(([key]) => key !== 'photos')
    .map(([key, value]) => [key, value.trim()]));
  data.slug = data.slug.toLowerCase();
  const message = problem(data);
  errorBox.hidden = message === null;
  errorBox.textContent = message ?? '';
  if (message) return;

  login(data.owner);
  const timeline = [
    data.homeDay && { date: data.homeDay, text: '来到家里' },
    { date: data.planetDay, text: '来到喵星' },
  ].filter(Boolean);
  addCat({
    slug: data.slug,
    name: data.name,
    owner: data.owner,
    tier: 'free',
    portrait: photos[0],
    coat: data.coat,
    birthday: data.birthday,
    homeDay: data.homeDay,
    planetDay: data.planetDay,
    story: data.story.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
    timeline,
    lights: 0,
    messages: [],
    generating: true,
  });
  location.href = `/${data.slug}`;
});

renderHeader();
