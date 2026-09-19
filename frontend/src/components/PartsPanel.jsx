export default function PartsPanel({ model }) {
  return (
    <aside className="parts-panel" aria-label="Parts list">
      <div className="parts-heading">
        <div>
          <p className="section-label">PARTS</p>
          <h3>{model.brick_count} pieces</h3>
        </div>
        <span>{model.statistics.unique_piece_types} types</span>
      </div>

      <ul className="parts-list">
        {model.parts.map((part) => (
          <li key={`${part.piece_id}-${part.color_id}`}>
            <span
              className="color-swatch"
              style={{ backgroundColor: part.color_hex }}
              aria-label={part.color_name}
              title={part.color_name}
            />
            <span className="part-description">
              <strong>{part.display_name}</strong>
              <small>{part.color_name}</small>
            </span>
            <span className="part-count">× {part.count}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
