export function PlaceholderProjectPreview() {
  return (
    <div 
      className="aspect-square relative bg-size-[3rem_3rem]"
      data-placeholder="true"
      style={{ 
        backgroundImage: 'linear-gradient(135deg, #C4B9A266 0%, #C4B9A266 12.5%, transparent 12.5%, transparent 37.5%, #C4B9A266 37.5%, #C4B9A266 62.5%, transparent 62.5%, transparent 87.5%, #C4B9A266 87.5%, #C4B9A266 100%), linear-gradient(#D5CCB7, #D5CCB7)'
      }}
    />
  );
}
