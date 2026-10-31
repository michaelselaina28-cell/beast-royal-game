import { zoneInfo } from "@game/balance";
import type { Combatant, MatchState, Terrain } from "@game/types";
import { useEffect, useRef } from "react";
import { AnimalArt } from "./AnimalArt";

const MAP_WIDTH = 640;
const MAP_HEIGHT = 420;

const ZONES: { id: Terrain; x: number; y: number; r: number }[] = [
  { id: "forest", x: 138, y: 112, r: 89 },
  { id: "swamp", x: 505, y: 112, r: 84 },
  { id: "cliff", x: 128, y: 318, r: 81 },
  { id: "river", x: 510, y: 315, r: 84 },
  { id: "center", x: 320, y: 212, r: 77 },
];

const COLORS: Record<Terrain, string> = {
  forest: "#42654a",
  swamp: "#53634a",
  cliff: "#77766b",
  river: "#3c8290",
  center: "#82924c",
};

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = "rgba(12, 27, 24, 0.3)";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + size * 0.28, size * 0.62, size * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#604a32";
  ctx.fillRect(x - size * 0.1, y - size * 0.1, size * 0.2, size * 0.55);
  ctx.fillStyle = "#244532";
  ctx.beginPath();
  ctx.arc(x, y - size * 0.25, size * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#356343";
  ctx.beginPath();
  ctx.arc(x - size * 0.18, y - size * 0.31, size * 0.23, 0, Math.PI * 2);
  ctx.arc(x + size * 0.18, y - size * 0.21, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = "rgba(12, 27, 24, 0.26)";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + size * 0.2, size * 0.72, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#697166";
  ctx.beginPath();
  ctx.moveTo(x - size * 0.62, y + size * 0.18);
  ctx.lineTo(x - size * 0.42, y - size * 0.35);
  ctx.lineTo(x - size * 0.05, y - size * 0.54);
  ctx.lineTo(x + size * 0.46, y - size * 0.3);
  ctx.lineTo(x + size * 0.62, y + size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#919184";
  ctx.beginPath();
  ctx.moveTo(x - size * 0.42, y - size * 0.35);
  ctx.lineTo(x - size * 0.05, y - size * 0.54);
  ctx.lineTo(x + size * 0.23, y - size * 0.34);
  ctx.lineTo(x - size * 0.08, y - size * 0.22);
  ctx.closePath();
  ctx.fill();
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(10, 20, 17, 0.35)";
  ctx.fillRect(x - 13, y - 3, 30, 20);
  ctx.fillStyle = "#835c35";
  ctx.fillRect(x - 15, y - 15, 30, 22);
  ctx.fillStyle = "#b9894d";
  ctx.fillRect(x - 12, y - 12, 24, 5);
  ctx.fillStyle = "#d7ed69";
  ctx.fillRect(x - 2, y - 14, 4, 20);
  ctx.strokeStyle = "#432f21";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 15, y - 15, 30, 22);
}

export function Arena({
  match,
  selected,
  onPick,
}: {
  match: MatchState;
  selected?: Terrain;
  onPick?: (z: Terrain) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const z = zoneInfo(match.round);
  const living = match.combatants.filter((combatant) => !combatant.eliminated);

  const markers = ZONES.flatMap((zone) => {
    const players = living.filter((combatant) => combatant.zone === zone.id);
    return players.map((combatant, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, players.length) - Math.PI / 2;
      const spread = players.length > 3 ? 36 : 24;
      return {
        combatant,
        x: zone.x + Math.cos(angle) * spread,
        y: zone.y + Math.sin(angle) * spread,
      };
    });
  });

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    const ground = ctx.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ground.addColorStop(0, "#294438");
    ground.addColorStop(0.52, "#526746");
    ground.addColorStop(1, "#314b3d");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    for (let i = 0; i < 180; i += 1) {
      const x = (i * 97 + 31) % MAP_WIDTH;
      const y = (i * 67 + 19) % MAP_HEIGHT;
      ctx.fillStyle = i % 3 === 0 ? "rgba(209, 218, 132, 0.16)" : "rgba(15, 42, 31, 0.12)";
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + (i % 3), 1.4, (i % 5) * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(604, 200);
    ctx.bezierCurveTo(520, 208, 555, 260, 468, 282);
    ctx.bezierCurveTo(420, 294, 500, 356, 430, 420);
    ctx.strokeStyle = "#9aa36a";
    ctx.lineWidth = 76;
    ctx.stroke();
    ctx.strokeStyle = "#387b88";
    ctx.lineWidth = 60;
    ctx.stroke();
    ctx.strokeStyle = "rgba(176, 222, 203, 0.45)";
    ctx.lineWidth = 3;
    ctx.stroke();

    for (const zone of ZONES) {
      const danger = !z.safe.includes(zone.id);
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
      ctx.fillStyle = danger ? "rgba(82, 43, 36, 0.58)" : `${COLORS[zone.id]}b8`;
      ctx.fill();
      ctx.lineWidth = selected === zone.id ? 5 : 2;
      ctx.setLineDash(danger ? [7, 6] : []);
      ctx.strokeStyle = selected === zone.id ? "#d7ed69" : danger ? "#ff8068" : "rgba(220, 230, 199, 0.58)";
      ctx.stroke();
      ctx.setLineDash([]);
      if (danger) {
        ctx.fillStyle = "rgba(226, 100, 74, 0.11)";
        ctx.fill();
      }
    }

    drawTree(ctx, 86, 91, 47);
    drawTree(ctx, 165, 71, 37);
    drawTree(ctx, 217, 134, 31);
    drawTree(ctx, 66, 166, 35);
    drawTree(ctx, 571, 76, 35);
    drawTree(ctx, 585, 146, 44);
    drawTree(ctx, 435, 80, 31);
    drawTree(ctx, 77, 365, 34);
    drawTree(ctx, 197, 362, 42);
    drawTree(ctx, 440, 373, 36);
    drawRock(ctx, 111, 291, 35);
    drawRock(ctx, 170, 346, 26);
    drawRock(ctx, 88, 339, 22);
    drawRock(ctx, 490, 97, 24);

    for (let i = 0; i < 22; i += 1) {
      const x = 444 + ((i * 29) % 126);
      const y = 66 + ((i * 41) % 111);
      ctx.strokeStyle = "rgba(177, 190, 105, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + (i % 2 ? 3 : -3), y - 4);
      ctx.stroke();
    }

    for (let i = 0; i < 26; i += 1) {
      const x = 248 + ((i * 43) % 151);
      const y = 140 + ((i * 31) % 144);
      ctx.fillStyle = i % 2 ? "rgba(241, 231, 154, 0.76)" : "rgba(222, 151, 120, 0.65)";
      ctx.beginPath();
      ctx.arc(x, y, i % 3 === 0 ? 2.3 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const crateZone = ZONES.find((zone) => zone.id === match.crateZone);
    if (match.crateAvailable && crateZone) drawCrate(ctx, crateZone.x + 43, crateZone.y + 38);

    ctx.strokeStyle = "rgba(224, 232, 199, 0.42)";
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, MAP_WIDTH - 6, MAP_HEIGHT - 6);

    for (const zone of ZONES) {
      ctx.fillStyle = "#eef6ef";
      ctx.font = "700 13px DM Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(12, 24, 20, 0.72)";
      ctx.fillText(zone.id.toUpperCase(), zone.x, zone.y + zone.r - 17);
    }
  }, [match, selected, z]);

  return (
    <div className="arena-wrap">
      <div className="arena-scene">
        <canvas
          ref={ref}
          className="arena"
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          role="img"
          aria-label="Tactical wilderness map with forest, swamp, cliff, river, central clearing, safe-zone status, loot crate, and player locations"
        />
        <div className="arena-markers" aria-hidden>
          {markers.map(({ combatant, x, y }) => (
            <div
              className={`arena-marker ${combatant.isBoss ? "boss" : ""}`}
              key={combatant.playerId}
              style={{ left: `${(x / MAP_WIDTH) * 100}%`, top: `${(y / MAP_HEIGHT) * 100}%` }}
              title={`${combatant.nickname} · ${combatant.animalId} · ${combatant.zone}`}
            >
              <AnimalArt id={combatant.animalId} size={34} />
              {combatant.isBoss && <span className="arena-boss-tag">BOSS</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="targets" style={{ padding: 8 }}>
        {ZONES.map((zone) => (
          <button
            key={zone.id}
            className={`btn btn-small ${selected === zone.id ? "btn-gold" : "btn-ghost"}`}
            onClick={() => onPick?.(zone.id)}
          >
            {zone.id}
            {!z.safe.includes(zone.id) ? " ⚠" : ""}
          </button>
        ))}
      </div>
      <p className="muted" style={{ padding: "0 8px 8px" }}>
        Safe: {z.safe.join(", ")}. Crate in {match.crateZone}. Zone damage {z.damage || "none"}. Weather: {match.weather}.
      </p>
    </div>
  );
}
