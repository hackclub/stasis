export function PlaceholderProjectPreview() {
  return (
    <div 
      className="aspect-square relative bg-[length:3rem_3rem]"
      data-placeholder="true"
      style={{ 
        backgroundImage: 'linear-gradient(135deg, #44382C33 0%, #44382C33 12.5%, transparent 12.5%, transparent 37.5%, #44382C33 37.5%, #44382C33 62.5%, transparent 62.5%, transparent 87.5%, #44382C33 87.5%, #44382C33 100%), linear-gradient(#3B3026, #3B3026)'
      }}
    />
  );
}
