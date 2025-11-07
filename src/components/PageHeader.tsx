import Tooltip from './Tooltip';
import '../styles/page-header.css';

type PageHeaderProps = {
  title: string;
  description?: string;
  tooltip?: string;
};

const PageHeader = ({ title, description, tooltip }: PageHeaderProps) => (
  <header className="page-header">
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    <Tooltip label={tooltip ?? `${title} tooltip placeholder`} />
  </header>
);

export default PageHeader;
