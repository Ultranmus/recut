import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, BrandMark } from "@/lib/brand-mark";

export const alt = "Recut: turn one long podcast or video into short clips with captions for every platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PLATFORMS = [
  { name: "Instagram Reels", color: "#ff375f" },
  { name: "LinkedIn", color: "#0a84ff" },
  { name: "X", color: "#f5f5f7" },
  { name: "YouTube Shorts", color: "#ff453a" },
];

// Bar heights for the clip card's waveform, picked by hand so it reads as speech.
const WAVE = [18, 34, 52, 28, 64, 80, 46, 70, 38, 58, 88, 62, 30, 50, 74, 42, 24, 56, 36, 20];

// The link preview shown on X, LinkedIn, Slack, WhatsApp and iMessage.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "64px 72px",
          backgroundColor: "#0a0a0c",
          backgroundImage:
            "radial-gradient(circle at 12% 8%, rgba(10,132,255,0.28), transparent 45%), radial-gradient(circle at 92% 95%, rgba(191,90,242,0.26), transparent 50%)",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <BrandMark size={64} />
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Recut</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 70,
                fontWeight: 700,
                letterSpacing: -2.5,
                lineHeight: 1.05,
                backgroundImage: "linear-gradient(90deg, #ffffff, #a9a9b3)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              One long episode.
            </div>
            <div style={{ fontSize: 70, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>A week of shorts.</div>
            <div style={{ marginTop: 26, fontSize: 27, color: "#a1a1aa", lineHeight: 1.4, maxWidth: 600 }}>
              Finds the best clips, writes on-brand captions, and takes your brief by voice.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  fontSize: 21,
                  color: "#d4d4d8",
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: p.color }} />
                {p.name}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginLeft: 40 }}>
          <div
            style={{
              width: 270,
              height: 480,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: 22,
              borderRadius: 36,
              border: "1px solid rgba(255,255,255,0.16)",
              backgroundColor: "#141417",
              backgroundImage: "linear-gradient(180deg, rgba(94,92,230,0.35), rgba(20,20,23,0) 60%)",
              boxShadow: "0 30px 80px -20px rgba(94,92,230,0.55)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 46,
                  height: 46,
                  borderRadius: 46,
                  border: "3px solid #30d158",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                94
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 15, color: "#a1a1aa" }}>Clip #1 · 0:42</div>
                <div style={{ fontSize: 19, fontWeight: 700 }}>Best moment</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 110 }}>
              {WAVE.map((h, i) => (
                <div key={i} style={{ width: 6, height: h, borderRadius: 6, backgroundImage: BRAND_GRADIENT }} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>Captions, word by word</div>
              <div style={{ display: "flex", height: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div style={{ width: "62%", borderRadius: 8, backgroundColor: "#0a84ff" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
