import React from "react";
import type { GroupSizeState, GroupSizeType } from "./groupSize";

type OptionProps = {
  type: GroupSizeType;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (type: GroupSizeType) => void;
  children: React.ReactNode;
};

function GroupSizeOption(props: OptionProps) {
  const id = `group-size-${props.type}`;
  return (
    <label
      className={`create-circle-group-size-option${props.selected ? " create-circle-group-size-option--selected" : ""}`}
      htmlFor={id}
    >
      <span className="create-circle-group-size-option-header row">
        <input
          id={id}
          type="radio"
          name="group-size-type"
          className="create-circle-group-size-radio"
          checked={props.selected}
          disabled={props.disabled}
          onChange={() => props.onSelect(props.type)}
        />
        <span className="create-circle-group-size-option-label">{props.label}</span>
      </span>
      {props.selected ? <div className="create-circle-group-size-inputs">{props.children}</div> : null}
    </label>
  );
}

function NumberField(props: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={1}
      step={1}
      inputMode="numeric"
      className="create-circle-input create-circle-group-size-number"
      value={props.value}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function CreateCircleGroupSizeStep(props: {
  value: GroupSizeState;
  onChange: (value: GroupSizeState) => void;
  disabled?: boolean;
  fieldError?: string | null;
  title?: string;
  helper?: string;
  showTip?: boolean;
}) {
  const { value, onChange, disabled, fieldError } = props;
  const title = props.title ?? "Group size";
  const helper = props.helper ?? "How many people should join this circle?";
  const showTip = props.showTip !== false;

  function patch(partial: Partial<GroupSizeState>) {
    onChange({ ...value, ...partial });
  }

  function selectType(type: GroupSizeType) {
    patch({ type });
  }

  return (
    <section className="create-circle-step stack" aria-labelledby="create-step-group-size">
      <h2 id="create-step-group-size" className="create-circle-step-title">
        {title}
      </h2>
      <p className="create-circle-helper muted">{helper}</p>

      <fieldset className="create-circle-group-size-fieldset">
        <legend className="sr-only">Group size type</legend>
        <div className="create-circle-group-size-options">
          <GroupSizeOption
            type="fixed"
            label="Fixed size"
            selected={value.type === "fixed"}
            disabled={disabled}
            onSelect={selectType}
          >
            <p className="create-circle-group-size-inline row">
              <span>Exactly</span>
              <NumberField
                value={value.fixedCount}
                disabled={disabled}
                ariaLabel="Fixed group size"
                onChange={(n) => patch({ fixedCount: n })}
              />
              <span>people</span>
            </p>
          </GroupSizeOption>

          <GroupSizeOption
            type="max"
            label="Maximum size"
            selected={value.type === "max"}
            disabled={disabled}
            onSelect={selectType}
          >
            <p className="create-circle-group-size-inline row">
              <span>Up to</span>
              <NumberField
                value={value.maxCount}
                disabled={disabled}
                ariaLabel="Maximum group size"
                onChange={(n) => patch({ maxCount: n })}
              />
              <span>people</span>
            </p>
          </GroupSizeOption>

          <GroupSizeOption
            type="min"
            label="Minimum size"
            selected={value.type === "min"}
            disabled={disabled}
            onSelect={selectType}
          >
            <p className="create-circle-group-size-inline row">
              <span>At least</span>
              <NumberField
                value={value.minCount}
                disabled={disabled}
                ariaLabel="Minimum group size"
                onChange={(n) => patch({ minCount: n })}
              />
              <span>people</span>
            </p>
          </GroupSizeOption>

          <GroupSizeOption
            type="range"
            label="Range"
            selected={value.type === "range"}
            disabled={disabled}
            onSelect={selectType}
          >
            <p className="create-circle-group-size-inline row">
              <span>Between</span>
              <NumberField
                value={value.rangeMin}
                disabled={disabled}
                ariaLabel="Minimum range size"
                onChange={(n) => patch({ rangeMin: n })}
              />
              <span>and</span>
              <NumberField
                value={value.rangeMax}
                disabled={disabled}
                ariaLabel="Maximum range size"
                onChange={(n) => patch({ rangeMax: n })}
              />
              <span>people</span>
            </p>
          </GroupSizeOption>
        </div>
      </fieldset>

      {fieldError ? (
        <p className="error" role="alert">
          {fieldError}
        </p>
      ) : null}

      {showTip ? (
        <p className="create-circle-helper muted create-circle-group-size-tip">
          Tip: Smaller groups (2–4 people) are easier for first meetings
        </p>
      ) : null}
    </section>
  );
}
