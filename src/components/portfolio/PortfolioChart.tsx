import type { AssetAllocation } from "@/hooks/usePortfolioCalculations";
import { SEGMENT_COLORS_DARK } from "@/lib/portfolioConfig";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioChartProps {
  assetAllocation: AssetAllocation[];
  showLabels?: boolean;
}

// Asset order: Cash, Option, ETF, Crypto, Stock (matching pentagon vertices)
const ASSET_ORDER = ["cash", "option", "etf", "crypto", "stock"];

// Get point coordinates for a vertex at a given angle and radius
function getPoint(centerX: number, centerY: number, angle: number, radius: number): [number, number] {
  const x = centerX + radius * Math.cos(angle);
  const y = centerY + radius * Math.sin(angle);
  return [x, y];
}

// Generate pentagon outline points (for reference rings)
function getPentagonOutline(centerX: number, centerY: number, radius: number): string {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    // Start from bottom (-90 degrees) and go clockwise (flipped upside down)
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 5);
    const [x, y] = getPoint(centerX, centerY, angle, radius);
    points.push([x, y]);
  }
  return points.map(p => `${p[0]},${p[1]}`).join(' ');
}

export function PortfolioChart({
  assetAllocation,
  showLabels = false,
}: PortfolioChartProps) {
  const colors = SEGMENT_COLORS_DARK;
  const centerX = 125;
  const centerY = 125;
  // maxRadius：几何上的最外层半径；业务上我们约定「单一资产 60% 时触达最外层」
  const maxRadius = 120;
  
  // Create a map of asset allocations by key
  const assetMap = new Map<string, AssetAllocation>();
  assetAllocation.forEach(asset => {
    assetMap.set(asset.key, asset);
  });
  
  // Get the 5 asset points (one per vertex)
  const vertexPoints: Array<{ x: number; y: number; color: string; percent: number; label: string }> = [];
  
  for (let i = 0; i < 5; i++) {
    const assetKey = ASSET_ORDER[i];
    const asset = assetMap.get(assetKey);
    
    if (asset) {
      // Calculate angle for this vertex (bottom vertex is -90 degrees, going clockwise - flipped upside down)
      const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 5);
      // Distance from center based on allocation percent (0% = center, 60% = maxRadius)
      // 单一资产持仓达到 60% 时，就触达最外层；超过 60% 按 maxRadius 封顶
      const radius = Math.min((asset.valueAllocationPercent / 60) * maxRadius, maxRadius);
      const [x, y] = getPoint(centerX, centerY, angle, radius);
      
      // Map color
      let color = asset.color;
      if (asset.key === "cash") color = colors.cash;
      else if (asset.key === "stock") color = colors.stock;
      else if (asset.key === "option") color = colors.option;
      else if (asset.key === "crypto") color = colors.crypto;
      else if (asset.key === "etf") color = colors.etf;
      
      vertexPoints.push({
        x,
        y,
        color,
        percent: asset.valueAllocationPercent,
        label: asset.label,
      });
    } else {
      // If asset doesn't exist, place at center
      const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 5);
      const [x, y] = getPoint(centerX, centerY, angle, 0);
      vertexPoints.push({
        x,
        y,
        color: "#333333",
        percent: 0,
        label: ASSET_ORDER[i],
      });
    }
  }
  
  // Create path string to connect the 5 points
  const pathPoints = vertexPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      viewBox="0 0 250 250"
      preserveAspectRatio="xMidYMid meet"
      className={styles.chartSvg}
    >
        {/* Draw percentage layer rings (15%, 30%, 45%, 60%) */}
        {[15, 30, 45, 60].map((percent, i) => {
          // 这里的 percent 直接按「X% of maxRadius」理解，最外层 60% = maxRadius
          const radius = (percent / 60) * maxRadius;
          if (radius > 0) {
            const points = getPentagonOutline(centerX, centerY, radius);
            return (
              <polygon
                key={`ring-${i}`}
                points={points}
            fill="none"
                stroke="#ffffff"
                strokeWidth={1}
                opacity={0.3}
              />
            );
          }
          return null;
        })}
        
        {/* Draw connecting lines from center to each vertex */}
        {vertexPoints.map((point, i) => (
          <line
            key={`line-${i}`}
            x1={centerX}
            y1={centerY}
            x2={point.x}
            y2={point.y}
            stroke="#ffffff"
            strokeWidth={1}
            opacity={0.2}
          />
        ))}
        
        {/* Draw filled polygon connecting the 5 points */}
        <polygon
          points={pathPoints}
          fill="rgba(255, 255, 255, 0.1)"
          stroke="#ffffff"
          strokeWidth={1.5}
        />
        
        {/* Draw the 5 vertex points */}
        {vertexPoints.map((point, i) => (
          <circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r={2.5}
            fill={point.color}
            stroke="#ffffff"
            strokeWidth={1}
          />
        ))}
        
        {/* Optional: labels at the outermost ring (100% ring) */}
        {showLabels &&
          vertexPoints.map((point, i) => {
          // Calculate label position at the outermost ring (100% = maxRadius)
          const angle = (-Math.PI / 2) + (i * 2 * Math.PI / 5);
          const labelOffset = 15; // Distance from outermost ring to label
          const outerRadius = maxRadius + labelOffset;
          const labelX = centerX + outerRadius * Math.cos(angle);
          const labelY = centerY + outerRadius * Math.sin(angle);
          
          return (
            <text
              key={`label-${i}`}
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              fontSize="10"
              fontWeight="500"
              opacity={0.9}
            >
              {point.label}
            </text>
          );
        })}
    </svg>
  );
}

