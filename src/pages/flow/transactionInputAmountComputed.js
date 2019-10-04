import React from 'react';
import { Field, FieldArray } from 'formik';
import { FieldGroup } from '../../components/bootstrap/Form';

const TransactionInputAmountComputed = ({
  errors,
  touched,
  values,
  setFieldValue
}) => (
  <FieldGroup name="valueType" prettyName="amount">
    <label className="radio">
      <Field
        type="radio"
        name="valueType"
        checked={values.valueType === 'static'}
        onChange={() => setFieldValue('valueType', 'static')}
      />
      Static
    </label>
    <label className="radio">
      <Field
        type="radio"
        name="valueType"
        checked={values.valueType === 'dynamic'}
        onChange={() => {
          setFieldValue('computedAmount.reference', '');
          setFieldValue('computedAmount.operation', 'none');
          setFieldValue('referencesArray[0]', {
            name: 'give me a name',
            value: 0,
            whereFrom: 'transaction'
          });
          setFieldValue('valueType', 'dynamic');
          setFieldValue('value', 0);
        }}
      />
      Dynamic
    </label>
    {values.valueType === 'static' ? (
      <FieldGroup errors={errors} name="value" touched={touched}>
        <Field name="value" type="number" className="input" />
      </FieldGroup>
    ) : (
      <React.Fragment>
        <References values={values} setFieldValue={setFieldValue} />
        <RecursiveAmountComputed
          values={values}
          setFieldValue={setFieldValue}
          level={0}
        />
      </React.Fragment>
    )}
  </FieldGroup>
);

export default TransactionInputAmountComputed;

const References = ({ errors, touched, values, setFieldValue }) => (
  <FieldArray
    name="referencesArray"
    render={arrayHelpers => (
      <React.Fragment>
        {values.referencesArray && values.referencesArray.length > 0 ? (
          <React.Fragment>
            {values.referencesArray.map((reference, index) =>
              reference.whereFrom !== 'transaction' ? null : (
                <React.Fragment key={index}>
                  <FieldGroup
                    name={`referencesArray[${index}].name`}
                    prettyName={`reference name`}
                  >
                    <Field
                      name={`referencesArray[${index}].name`}
                      className="input"
                    />
                  </FieldGroup>
                  <FieldGroup
                    name={`referencesArray[${index}].value`}
                    prettyName={`reference value`}
                  >
                    <Field
                      name={`referencesArray[${index}].value`}
                      type="number"
                      className="input"
                    />
                  </FieldGroup>
                  <button
                    type="button"
                    className="button"
                    onClick={() => arrayHelpers.remove(index)}
                  >
                    -
                  </button>
                </React.Fragment>
              )
            )}
            <button
              type="button"
              className="button"
              onClick={() =>
                arrayHelpers.push({
                  name: '',
                  value: 0,
                  whereFrom: 'transaction'
                })
              }
            >
              +
            </button>
          </React.Fragment>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() =>
              arrayHelpers.push({
                name: '',
                value: 0,
                whereFrom: 'transaction'
              })
            }
          >
            {/* show this when user has removed all friends from the list */}+
          </button>
        )}
      </React.Fragment>
    )}
  />
);

const RecursiveAmountComputed = ({ values, setFieldValue, level }) => (
  <React.Fragment>
    <FieldGroup
      name={`computedAmount${'.on'.repeat(level)}.reference`}
      prettyName="reference"
    >
      <div className="select">
        <Field
          as="select"
          name={`computedAmount${'.on'.repeat(level)}.reference`}
        >
          <option key={'default'} value="select">
            Select
          </option>
          {!values.referencesArray
            ? null
            : values.referencesArray.map((reference, index) => (
                <option key={index} value={reference.name}>
                  {reference.name}
                </option>
              ))}
        </Field>
      </div>
    </FieldGroup>

    <FieldGroup
      name={`computedAmount${'.on'.repeat(level)}.operation`}
      prettyName="operate on"
    >
      <Operation
        operationType="none"
        values={values}
        level={level}
        setFieldValue={setFieldValue}
      />
      <Operation
        operationType="plus"
        values={values}
        level={level}
        setFieldValue={setFieldValue}
      />
      <Operation
        operationType="minus"
        values={values}
        level={level}
        setFieldValue={setFieldValue}
      />

      {retrieveNested('operation', values, level) !== 'none' ? (
        <React.Fragment>
          <RecursiveAmountComputed
            values={values}
            setFieldValue={setFieldValue}
            level={level + 1}
          />
        </React.Fragment>
      ) : null}
    </FieldGroup>
  </React.Fragment>
);

const retrieveNested = (value, values, levelRequired, recursiveLevel = 0) => {
  if (!values) return 'none';
  const computedAmount = recursiveLevel === 0 ? values.computedAmount : values;
  return levelRequired === recursiveLevel
    ? computedAmount[value]
    : retrieveNested(
        value,
        computedAmount.on,
        levelRequired,
        recursiveLevel + 1
      );
};

const Operation = ({ operationType, values, level, setFieldValue }) => (
  <React.Fragment>
    <label className="radio">
      <Field
        type="radio"
        name={`computedAmount${'.on'.repeat(level)}.operation`}
        checked={retrieveNested('operation', values, level) === operationType}
        onChange={() => {
          setFieldValue(
            `computedAmount${'.on'.repeat(level)}.operation`,
            operationType
          );
          if (operationType !== 'none') {
            setFieldValue(
              `computedAmount${'.on'.repeat(level + 1)}.operation`,
              'none'
            );
            setFieldValue(
              `computedAmount${'.on'.repeat(level + 1)}.reference`,
              'select'
            );
          }
        }}
      />
      {operationType}
    </label>
  </React.Fragment>
);