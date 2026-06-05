type PanelHeaderProps = {
  id: string;
  title: string;
  description?: string;
};

export function PanelHeader({ id, title, description }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 id={id}>{title}</h2>
      {description?.trim() ? <p>{description}</p> : null}
    </div>
  );
}
