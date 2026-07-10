import { Warp } from '@paper-design/shaders-react';

// 全屏背景 Warp shader 動畫
// 使用品牌配色（深藍 / 紫 / 綠 / accent 藍），慢速柔和以不干擾前景 glassmorphism 卡片
export default function WarpBackground() {
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                opacity: 0.45,
                overflow: 'hidden',
            }}
        >
            <Warp
                colors={['#0f172a', '#1e293b', '#3b82f6', '#8b5cf6', '#10b981']}
                proportion={0.5}
                softness={0.9}
                distortion={0.25}
                swirl={0.6}
                swirlIterations={6}
                shape="stripes"
                shapeScale={0.35}
                speed={0.25}
                scale={1.6}
                rotation={20}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
}
