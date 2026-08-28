/**
 * Badge visuel pour afficher la couleur de l'employé assigné à une commande
 */
export function OrderColorBadge({
  assigneeName,
  assigneeColor,
  size = "md",
}: {
  assigneeName?: string;
  assigneeColor?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (!assigneeColor || !assigneeName) {
    return null;
  }

  const sizeClasses = {
    sm: "h-5 w-5",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full border-2 border-white dark:border-slate-900 shadow-md flex-shrink-0 transition-transform hover:scale-110`}
      style={{ backgroundColor: assigneeColor }}
      title={assigneeName}
    />
  );
}

/**
 * Conteneur de commande avec bordure colorée selon l'employé
 */
export function OrderColorContainer({
  assigneeColor,
  children,
  className = "",
}: {
  assigneeColor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!assigneeColor) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`border-l-4 ${className}`}
      style={{
        borderColor: assigneeColor,
        backgroundColor: `${assigneeColor}08`, // 5% opacity background
      }}
    >
      {children}
    </div>
  );
}

/**
 * Card entièrement colorée selon l'employé
 */
export function OrderColorCard({
  assigneeColor,
  assigneeName,
  children,
  className = "",
}: {
  assigneeColor?: string;
  assigneeName?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!assigneeColor) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`rounded-lg border-2 overflow-hidden ${className}`}
      style={{ borderColor: assigneeColor }}
    >
      {/* Header coloré */}
      <div
        className="px-4 py-2 text-white text-sm font-semibold flex items-center gap-2"
        style={{ backgroundColor: assigneeColor }}
      >
        <div className="h-3 w-3 rounded-full bg-white/30" />
        {assigneeName}
      </div>
      {/* Contenu */}
      <div className="p-4" style={{ backgroundColor: `${assigneeColor}06` }}>
        {children}
      </div>
    </div>
  );
}
