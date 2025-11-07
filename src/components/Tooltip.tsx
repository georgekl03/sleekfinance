import '../styles/tooltip.css';

type TooltipProps = {
  label: string;
};

const Tooltip = ({ label }: TooltipProps) => (
  <span className="tooltip" role="img" aria-label={label} title={label}>
    ⓘ
  </span>
);

export default Tooltip;
