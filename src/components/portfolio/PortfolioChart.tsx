import type { AssetAllocation } from "@/hooks/usePortfolioCalculations";
import { SEGMENT_COLORS_DARK } from "@/lib/portfolioConfig";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioChartProps {
  assetAllocation: AssetAllocation[];
  isDarkMode?: boolean;
}

// Asset order: Cash, Stock, Option, Crypto, ETF (matching pentagon vertices)
const ASSET_ORDER = ["cash", "stock", "option", "crypto", "etf"];

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
}: PortfolioChartProps) {
  const colors = SEGMENT_COLORS_DARK;
  const centerX = 100;
  const centerY = 100;
  const maxRadius = 100;
  
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
      // Distance from center based on absolute percentage (0% = center, 60% = maxRadius)
      // Scale so 60% represents full width
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
    <div className={styles.chartWrapper}>
      <svg width={200} height={200} viewBox="0 0 200 200">
        {/* Draw percentage layer rings (white rings at 0%, 20%, 40%, 60%, 80%, 100%) */}
        {[0, 20, 40, 60, 80, 100].map((percent, i) => {
          const radius = (percent / 100) * maxRadius;
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
      </svg>
    </div>
  );
}

