/**
 * Timeline routes fill the viewport below the header so Timeline KB (3D graph)
 * can use flex height + internal scroll instead of growing the whole page.
 */
export default function TimelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
