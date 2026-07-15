import { BloodyButton } from "@/components/themes/bloody";

interface FormSubmitButtonProps {
  isSubmitting: boolean;
  label: string;
}

export default function FormSubmitButton({ isSubmitting, label }: Readonly<FormSubmitButtonProps>) {
  return (
    <div className="mt-6 flex gap-3">
      <BloodyButton
        type="submit"
        disabled={isSubmitting}
        variant="primary"
        blood={true}
        className="flex-1 px-6 py-3"
      >
        {label}
      </BloodyButton>
    </div>
  );
}
