type PanelHeaderProps = {
  id: string;
  title: string;
  description: string;
};

export function PanelHeader({ id, title, description }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
