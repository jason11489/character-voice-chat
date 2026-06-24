# virtual-avatar

노트북에서 실행하는 React + Three.js 3D 캐릭터 앱입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에서 라즈베리파이 IP를 설정하세요.

```env
VITE_PI_API_BASE=http://192.168.0.23:8000
```

## VRM 모델

`public/models/momo.vrm`에 VRM 파일을 넣으면 실제 3D 캐릭터가 로드됩니다.  
파일이 없으면 fallback mascot이 표시됩니다.