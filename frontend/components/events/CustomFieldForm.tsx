'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface CustomField {
  id: number;
  field_name: string;
  field_type: string;
  is_required: boolean;
  options?: string[];
}

interface CustomFieldFormProps {
  fields: CustomField[];
  onSubmit: (responses: { field_id: number; value: string }[]) => void;
  loading?: boolean;
}

export function CustomFieldForm({ fields, onSubmit, loading }: CustomFieldFormProps) {
  const [formData, setFormData] = useState<Record<number, string | string[]>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  const handleChange = (id: number, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[id];
        return newErrors;
      });
    }
  };

  const handleCheckboxToggle = (id: number, option: string, checked: boolean) => {
    setFormData((prev) => {
      const current = (prev[id] as string[]) || [];
      const updated = checked ? [...current, option] : current.filter((v) => v !== option);
      return { ...prev, [id]: updated };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<number, string> = {};

    fields.forEach((field) => {
      const val = formData[field.id];
      if (field.is_required) {
        if (!val || (Array.isArray(val) && val.length === 0)) {
          newErrors[field.id] = 'This field is required';
        }
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const formattedResponses = fields.map((field) => {
      const val = formData[field.id];
      const stringValue = Array.isArray(val) ? JSON.stringify(val) : (val as string) || '';
      return {
        field_id: field.id,
        value: stringValue,
      };
    });

    onSubmit(formattedResponses);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fields.map((field) => {
        const label = `${field.field_name} ${field.is_required ? '*' : ''}`;

        return (
          <div key={field.id} className="space-y-1">
            {field.field_type === 'text' && (
              <Input
                label={label}
                value={(formData[field.id] as string) || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              />
            )}

            {field.field_type === 'textarea' && (
              <Textarea
                label={label}
                value={(formData[field.id] as string) || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              />
            )}

            {field.field_type === 'select' && (
              <Select
                label={label}
                value={(formData[field.id] as string) || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              >
                <option value="">Select an option</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            )}

            {field.field_type === 'multiselect' && (
              <div>
                <label className="block text-sm font-medium text-espresso mb-2">{label}</label>
                <div className="space-y-2">
                  {field.options?.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-espresso">
                      <input
                        type="checkbox"
                        checked={((formData[field.id] as string[]) || []).includes(opt)}
                        onChange={(e) => handleCheckboxToggle(field.id, opt, e.target.checked)}
                        className="rounded border-oat text-burgundy focus:ring-burgundy"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                {errors[field.id] && (
                  <p className="text-xs text-burgundy mt-1">{errors[field.id]}</p>
                )}
              </div>
            )}

            {field.field_type === 'checkbox' && (
              <div>
                <label className="flex items-center gap-2 text-sm text-espresso mt-6">
                  <input
                    type="checkbox"
                    checked={(formData[field.id] as string) === 'true'}
                    onChange={(e) => handleChange(field.id, e.target.checked ? 'true' : 'false')}
                    className="rounded border-oat text-burgundy focus:ring-burgundy"
                  />
                  {label}
                </label>
                {errors[field.id] && (
                  <p className="text-xs text-burgundy mt-1">{errors[field.id]}</p>
                )}
              </div>
            )}

            {field.field_type === 'date' && (
              <Input
                type="date"
                label={label}
                value={(formData[field.id] as string) || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              />
            )}

            {field.field_type === 'url' && (
              <Input
                type="url"
                label={label}
                value={(formData[field.id] as string) || ''}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              />
            )}

            {field.field_type === 'file' && (
              <Input
                type="file"
                label={label}
                onChange={(e) => handleChange(field.id, e.target.value)}
                error={errors[field.id]}
              />
            )}
          </div>
        );
      })}

      <div className="pt-4 border-t border-oat flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit Registration'}
        </Button>
      </div>
    </form>
  );
}
