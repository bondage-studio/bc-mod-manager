import type {ModalState} from "@/ui/store/ModalStore.ts";
import {Component} from "preact";
import Button from "@/component/ui/Button";
import CloseButton from "@/component/ui/CloseButton";
import DialogPanel from "@/component/ui/DialogPanel";
import Input from "@/component/ui/Input";
import ModalBackdrop from "@/component/ui/ModalBackdrop";
import Textarea from "@/component/ui/Textarea";
import {t} from "@/i18n/i18n";

interface ModalDialogProps {
  modal: ModalState;
  onClose: (action: string, inputValue?: string) => void;
}

interface ModalDialogState {
  inputValue: string;
}

/**
 * Individual Modal Dialog Component
 */
export default class ModalDialog extends Component<ModalDialogProps, ModalDialogState> {
  constructor(props: ModalDialogProps) {
    super(props);
    this.state = {
      inputValue: props.modal.input?.initial ?? "",
    };
  }

  handleAction = (action: string) => {
    const {modal, onClose} = this.props;
    const {inputValue} = this.state;

    // Call the callback with action and input value (if input exists)
    if (modal.input) {
      onClose(action, inputValue);
    } else {
      onClose(action);
    }
  };

  handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    this.setState({inputValue: target.value});
  };

  render() {
    const {modal} = this.props;
    const {inputValue} = this.state;

    // Default buttons if not specified
    const buttons = modal.buttons ?? {submit: t('button-ok'), cancel: t('button-cancel')};
    const submitLabel = buttons.submit;

    // Get all other buttons (excluding submit)
    const otherButtons = Object.entries(buttons).filter(([key]) => key !== "submit");

    return (
      <ModalBackdrop className="z-[70]">
        <DialogPanel>
          <CloseButton
            onClick={() => this.handleAction("close")}
            className="self-end -mt-1 -mr-1"
            variant="dialog"
          />

          {/* Prompt */}
          <div className="mb-4 text-bmm-ink">
            {typeof modal.prompt === "string" ? (
              <p className="text-base font-semibold leading-6">{modal.prompt}</p>
            ) : (
              modal.prompt
            )}
          </div>

          {/* Input Field */}
          {modal.input && (
            <div className="mb-4">
              {modal.input.type === "textarea" ? (
                <Textarea
                  value={inputValue}
                  onInput={this.handleInputChange}
                  readOnly={modal.input.readonly}
                  rows={4}
                />
              ) : (
                <Input
                  type="text"
                  value={inputValue}
                  onInput={this.handleInputChange}
                  readOnly={modal.input.readonly}
                />
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            {/* Other buttons (like cancel) */}
            {otherButtons.map(([action, label]) => (
              <Button
                key={action}
                onClick={() => this.handleAction(action)}
                variant="neutral"
              >
                {label}
              </Button>
            ))}

            {/* Submit button */}
            <Button
              onClick={() => this.handleAction("submit")}
              variant="primary"
            >
              {submitLabel}
            </Button>
          </div>
        </DialogPanel>
      </ModalBackdrop>
    );
  }
}
