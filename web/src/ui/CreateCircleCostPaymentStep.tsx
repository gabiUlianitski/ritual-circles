import React from "react";
import type { GroupSizeState } from "./groupSize";
import {
  COST_CURRENCIES,
  estimateSplitCostPerPerson,
  formatCurrencyAmount,
  type CostCurrency,
  type CostPaymentState,
  type CostPaymentType,
} from "./circlePayment";
import { splitCostMayDecrease } from "./groupSize";

type OptionProps = {
  type: CostPaymentType;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (type: CostPaymentType) => void;
  children?: React.ReactNode;
};

function CostOption(props: OptionProps) {
  const id = `cost-payment-${props.type}`;
  return (
    <label
      className={`create-circle-group-size-option${props.selected ? " create-circle-group-size-option--selected" : ""}`}
      htmlFor={id}
    >
      <span className="create-circle-group-size-option-header row">
        <input
          id={id}
          type="radio"
          name="cost-payment-type"
          className="create-circle-group-size-radio"
          checked={props.selected}
          disabled={props.disabled}
          onChange={() => props.onSelect(props.type)}
        />
        <span className="stack create-circle-cost-option-text">
          <span className="create-circle-group-size-option-label">{props.label}</span>
          <span className="create-circle-helper muted">{props.description}</span>
        </span>
      </span>
      {props.selected && props.children ? (
        <div className="create-circle-group-size-inputs">{props.children}</div>
      ) : null}
    </label>
  );
}

function MoneyField(props: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={0.01}
      step={0.01}
      inputMode="decimal"
      className="create-circle-input create-circle-cost-amount"
      value={props.value}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

function CurrencySelect(props: {
  value: CostCurrency;
  onChange: (value: CostCurrency) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <select
      id={props.id}
      className="create-circle-input create-circle-cost-currency"
      value={props.value}
      disabled={props.disabled}
      aria-label="Currency"
      onChange={(e) => props.onChange(e.target.value as CostCurrency)}
    >
      {COST_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export function CreateCircleCostPaymentStep(props: {
  value: CostPaymentState;
  groupSize: GroupSizeState;
  onChange: (value: CostPaymentState) => void;
  disabled?: boolean;
  fieldError?: string | null;
}) {
  const { value, groupSize, onChange, disabled, fieldError } = props;

  function patch(partial: Partial<CostPaymentState>) {
    onChange({ ...value, ...partial });
  }

  function selectType(type: CostPaymentType) {
    patch({ type });
  }

  const splitEstimate =
    value.type === "split" ? estimateSplitCostPerPerson(value.totalCost, groupSize) : null;

  return (
    <section className="create-circle-step stack" aria-labelledby="create-step-cost-payment">
      <h2 id="create-step-cost-payment" className="create-circle-step-title">
        Cost &amp; Payment
      </h2>
      <p className="create-circle-helper muted">Do participants need to pay to join this circle?</p>

      <fieldset className="create-circle-group-size-fieldset">
        <legend className="sr-only">Cost and payment type</legend>
        <div className="create-circle-group-size-options">
          <CostOption
            type="free"
            label="Free"
            description="No payment required"
            selected={value.type === "free"}
            disabled={disabled}
            onSelect={selectType}
          />

          <CostOption
            type="split"
            label="Split cost"
            description="Divide a total cost between participants"
            selected={value.type === "split"}
            disabled={disabled}
            onSelect={selectType}
          >
            <div className="create-circle-cost-fields stack">
              <label className="create-circle-field stack">
                <span className="create-circle-label">Total cost</span>
                <span className="create-circle-cost-inline row">
                  <MoneyField
                    value={value.totalCost}
                    disabled={disabled}
                    ariaLabel="Total cost"
                    onChange={(n) => patch({ totalCost: n })}
                  />
                  <CurrencySelect
                    id="cost-split-currency"
                    value={value.currency}
                    disabled={disabled}
                    onChange={(currency) => patch({ currency })}
                  />
                </span>
              </label>
              {splitEstimate != null ? (
                <p className="create-circle-helper muted">
                  Estimated cost per person: {formatCurrencyAmount(splitEstimate, value.currency)}
                  {splitCostMayDecrease(groupSize) ? " — may be lower with more people" : ""}
                </p>
              ) : null}
            </div>
          </CostOption>

          <CostOption
            type="per_person"
            label="Price per person"
            description="Each participant pays a fixed amount"
            selected={value.type === "per_person"}
            disabled={disabled}
            onSelect={selectType}
          >
            <label className="create-circle-field stack">
              <span className="create-circle-label">Price per person</span>
              <span className="create-circle-cost-inline row">
                <MoneyField
                  value={value.pricePerPerson}
                  disabled={disabled}
                  ariaLabel="Price per person"
                  onChange={(n) => patch({ pricePerPerson: n })}
                />
                <CurrencySelect
                  id="cost-per-person-currency"
                  value={value.currency}
                  disabled={disabled}
                  onChange={(currency) => patch({ currency })}
                />
              </span>
            </label>
          </CostOption>
        </div>
      </fieldset>

      {fieldError ? (
        <p className="error" role="alert">
          {fieldError}
        </p>
      ) : null}

      <p className="create-circle-helper muted">Payment will be handled by the organizer</p>

      <label className="create-circle-field stack">
        <span className="create-circle-label">Payment instructions (optional)</span>
        <input
          type="text"
          className="create-circle-input"
          placeholder='e.g. "Bring cash" or "Pay via Bit"'
          value={value.paymentNote}
          disabled={disabled}
          onChange={(e) => patch({ paymentNote: e.target.value })}
        />
      </label>
    </section>
  );
}
