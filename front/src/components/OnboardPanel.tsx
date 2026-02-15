import { Panel } from "./Panel";
import { CopyButton } from "./shared/CopyButton";

interface OnboardPanelProps {
  readOnlyCmd: string;
}

export function OnboardPanel({ readOnlyCmd }: OnboardPanelProps) {
  return (
    <Panel title="ONBOARD" className="h-full" id="onboard">
      <div className="space-y-3 text-t-sm text-text-bright">
        <section>
          <h3 className="mb-2 text-t-xs uppercase tracking-[0.08em] text-text-secondary">Curl command</h3>
          <div className="panel-code">
            <pre>{readOnlyCmd}</pre>
          </div>
          <div className="mt-2 flex justify-end">
            <CopyButton text={readOnlyCmd} />
          </div>
        </section>
      </div>
    </Panel>
  );
}
