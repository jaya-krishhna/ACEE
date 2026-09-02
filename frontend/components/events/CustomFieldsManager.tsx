'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useCustomFields, useSetCustomFields } from '@/lib/queries';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Skeleton';
import { CustomField } from '@/lib/types';

interface CustomFieldsManagerProps {
  eventId: string;
}

export function CustomFieldsManager({ eventId }: CustomFieldsManagerProps) {
  const { data: fieldsData, isLoading } = useCustomFields(eventId);
  const setFieldsMutation = useSetCustomFields();

  const [fields, setFields] = useState<Partial<CustomField>[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (fieldsData) {
      setFields(fieldsData);
    }
  }, [fieldsData]);

  const handleAddField = () => {
    setFields([
      ...fields,
      {
        label: '',
        field_type: 'text',
        options: null,
        is_required: false,
        sort_order: fields.length,
      },
    ]);
  };

  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleChange = (index: number, key: keyof CustomField, value: any) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setFields(newFields);
  };

  const handleSave = async () => {
    setErrorMsg('');
    try {
      // Clean up options if not select/multiselect
      const cleanedFields = fields.map((f, i) => {
        const needsOptions = f.field_type === 'select' || f.field_type === 'multiselect';
        let options = f.options;
        if (needsOptions && typeof options === 'string') {
          options = (options as string)
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
        } else if (!needsOptions) {
          options = null;
        }
        return {
          label: f.label || 'Untitled Field',
          field_type: f.field_type || 'text',
          options: options || null,
          is_required: !!f.is_required,
          sort_order: i,
        } as any;
      });

      await setFieldsMutation.mutateAsync({ id: eventId, fields: cleanedFields });
      toast.success('Custom fields saved successfully');
    } catch (err: any) {
      if (err.status === 409) {
        setIsLocked(true);
        setErrorMsg(
          'Cannot edit custom fields because registrations already exist for this event.',
        );
      } else {
        setErrorMsg(err.message || 'Failed to save custom fields');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8 bg-ivory rounded-[10px] border border-oat mt-8">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="bg-ivory border border-oat rounded-[10px] p-6 shadow-sm mt-8 space-y-6">
      <div>
        <h3 className="text-xl font-serif font-bold text-espresso">Custom Registration Fields</h3>
        <p className="text-sm text-shadow font-sans">
          Add custom fields to collect additional information during registration.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-burgundy/10 text-burgundy border border-burgundy/20 p-4 rounded-[10px] text-sm">
          {errorMsg}
        </div>
      )}

      {isLocked ? (
        <div className="bg-sunlit p-4 rounded-[10px] text-sm text-espresso border border-oat">
          These fields are locked because students have already registered for this event.
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => {
            const needsOptions =
              field.field_type === 'select' || field.field_type === 'multiselect';
            const optionsValue = Array.isArray(field.options)
              ? field.options.join(', ')
              : field.options || '';

            return (
              <div key={index} className="bg-sunlit p-4 rounded-[10px] relative border border-oat">
                <button
                  type="button"
                  onClick={() => handleRemoveField(index)}
                  className="absolute top-2 right-2 text-shadow hover:text-burgundy w-6 h-6 flex items-center justify-center rounded-full bg-ivory shadow-sm border border-oat"
                  title="Remove field"
                >
                  &times;
                </button>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">
                  <div className="md:col-span-4">
                    <Input
                      label="Field label"
                      value={field.label || ''}
                      onChange={(e) => handleChange(index, 'label', e.target.value)}
                      placeholder="e.g. T-Shirt Size"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Select
                      label="Field type"
                      value={field.field_type || 'text'}
                      onChange={(e) => handleChange(index, 'field_type', e.target.value)}
                      options={[
                        { label: 'Text', value: 'text' },
                        { label: 'Textarea', value: 'textarea' },
                        { label: 'Select', value: 'select' },
                        { label: 'Multi-select', value: 'multiselect' },
                        { label: 'Checkbox', value: 'checkbox' },
                        { label: 'Date', value: 'date' },
                        { label: 'URL', value: 'url' },
                      ]}
                    />
                  </div>
                  <div className="md:col-span-5 flex items-center pt-6 px-4">
                    <label className="flex items-center space-x-2 text-sm font-medium text-espresso">
                      <input
                        type="checkbox"
                        checked={field.is_required || false}
                        onChange={(e) => handleChange(index, 'is_required', e.target.checked)}
                        className="rounded border-oat text-burgundy focus:ring-burgundy"
                      />
                      <span>Required field</span>
                    </label>
                  </div>

                  {needsOptions && (
                    <div className="md:col-span-12">
                      <Input
                        label="Options (comma-separated)"
                        value={optionsValue}
                        onChange={(e) => handleChange(index, 'options', e.target.value)}
                        placeholder="Small, Medium, Large, X-Large"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <Button type="button" variant="secondary" onClick={handleAddField}>
            Add custom field
          </Button>

          <div className="pt-4 border-t border-oat flex justify-end">
            <Button onClick={handleSave} isLoading={setFieldsMutation.isPending}>
              Save fields
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
