import {Component} from 'preact';
import {CustomExtensionService} from '@/service/CustomExtensionService';
import type {CustomExtension, CustomExtensionType} from '@/domain/CustomExtension';
import {ModalStore} from '@/ui/store/ModalStore';
import {t} from '@/i18n/i18n';
import Alert from '@/component/ui/Alert';
import Badge from '@/component/ui/Badge';
import Button from '@/component/ui/Button';
import CloseButton from '@/component/ui/CloseButton';
import EmptyState from '@/component/ui/EmptyState';
import Field from '@/component/ui/Field';
import FormGrid from '@/component/ui/FormGrid';
import Input from '@/component/ui/Input';
import ListRow from '@/component/ui/ListRow';
import ModalBackdrop from '@/component/ui/ModalBackdrop';
import ModalPanel from '@/component/ui/ModalPanel';
import Panel from '@/component/ui/Panel';
import Select from '@/component/ui/Select';
import Textarea from '@/component/ui/Textarea';

interface CustomExtensionModalProps {
  onClose: () => void;
  onExtensionAdded: () => void;
}

interface CustomExtensionModalState {
  extensions: CustomExtension[];
  showAddForm: boolean;
  editingId: string | null;
  formData: {
    name: string;
    author: string;
    description: string;
    sourceUrl: string;
    type: CustomExtensionType;
    icon: string;
    repository: string;
    website: string;
    tags: string;
  };
  error: string | null;
  success: string | null;
}

export default class CustomExtensionModal extends Component<CustomExtensionModalProps, CustomExtensionModalState> {
  constructor(props: CustomExtensionModalProps) {
    super(props);
    this.state = {
      extensions: CustomExtensionService.getAll(),
      showAddForm: false,
      editingId: null,
      formData: this.getEmptyFormData(),
      error: null,
      success: null,
    };
  }

  getEmptyFormData() {
    return {
      name: '',
      author: '',
      description: '',
      sourceUrl: '',
      type: 'script' as CustomExtensionType,
      icon: '',
      repository: '',
      website: '',
      tags: '',
    };
  }

  handleInputChange = (field: keyof CustomExtensionModalState['formData'], value: string) => {
    this.setState(prevState => ({
      formData: {
        ...prevState.formData,
        [field]: value,
      },
    }));
  };

  handleAddNew = () => {
    this.setState({
      showAddForm: true,
      editingId: null,
      formData: this.getEmptyFormData(),
      error: null,
      success: null,
    });
  };

  handleEdit = (extension: CustomExtension) => {
    this.setState({
      showAddForm: true,
      editingId: extension.id,
      formData: {
        name: extension.name,
        author: extension.author,
        description: extension.description,
        sourceUrl: extension.sourceUrl,
        type: extension.type,
        icon: extension.icon || '',
        repository: extension.repository || '',
        website: extension.website || '',
        tags: extension.tags?.join(', ') || '',
      },
      error: null,
      success: null,
    });
  };

  handleSubmit = () => {
    const {formData, editingId} = this.state;

    // Validate
    if (!formData.name.trim()) {
      this.setState({error: t('error-extension-name-required'), success: null});
      return;
    }

    if (!formData.sourceUrl.trim()) {
      this.setState({error: t('error-extension-source-url-required'), success: null});
      return;
    }

    // Parse tags
    const tags = formData.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const extensionData = {
      name: formData.name.trim(),
      author: formData.author.trim() || 'Unknown',
      description: formData.description.trim(),
      sourceUrl: formData.sourceUrl.trim(),
      type: formData.type,
      icon: formData.icon.trim() || undefined,
      repository: formData.repository.trim() || undefined,
      website: formData.website.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    let result;
    if (editingId) {
      // Update existing
      result = CustomExtensionService.update(editingId, extensionData);
      if (result) {
        this.setState({
          extensions: CustomExtensionService.getAll(),
          showAddForm: false,
          editingId: null,
          formData: this.getEmptyFormData(),
          error: null,
          success: t('success-extension-updated'),
        });
        this.props.onExtensionAdded();
      } else {
        this.setState({error: t('error-update-extension-failed'), success: null});
      }
    } else {
      // Add new
      result = CustomExtensionService.add(extensionData);
      if (result) {
        this.setState({
          extensions: CustomExtensionService.getAll(),
          showAddForm: false,
          formData: this.getEmptyFormData(),
          error: null,
          success: t('success-extension-added'),
        });
        this.props.onExtensionAdded();
      } else {
        this.setState({error: t('error-add-extension-failed'), success: null});
      }
    }
  };

  handleDelete = async (id: string) => {
    if (await ModalStore.confirm(t('confirm-delete-extension'), {confirmLabel: t('button-delete')})) {
      const success = CustomExtensionService.remove(id);
      if (success) {
        this.setState({
          extensions: CustomExtensionService.getAll(),
          error: null,
          success: t('success-extension-deleted'),
        });
        this.props.onExtensionAdded();
      } else {
        this.setState({error: t('error-delete-extension-failed'), success: null});
      }
    }
  };

  handleCancel = () => {
    this.setState({
      showAddForm: false,
      editingId: null,
      formData: this.getEmptyFormData(),
      error: null,
    });
  };

  renderFormModal() {
    const {showAddForm, editingId, formData, error} = this.state;

    if (!showAddForm) {
      return null;
    }

    return (
      <ModalBackdrop className="z-[60]">
        <ModalPanel
          title={editingId ? t('button-edit') : t('title-add-custom-extension')}
          actions={<CloseButton
            onClick={this.handleCancel}
            variant="modal"
          />}
          footer={(
            <div className="flex justify-end gap-2">
              <Button
                onClick={this.handleCancel}
                variant="neutral"
              >
                {t('button-cancel')}
              </Button>
              <Button
                onClick={this.handleSubmit}
                variant="primary"
              >
                {editingId ? t('button-save') : t('button-add')}
              </Button>
            </div>
          )}
        >
          {error && (
            <Alert>
              {error}
            </Alert>
          )}

          <FormGrid>
            <Field label={`${t('label-extension-name')} *`}>
              <Input
                type="text"
                value={formData.name}
                onInput={(e) => this.handleInputChange('name', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-name')}
              />
            </Field>

            <Field label={t('label-extension-author')}>
              <Input
                type="text"
                value={formData.author}
                onInput={(e) => this.handleInputChange('author', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-author')}
              />
            </Field>

            <Field label={t('label-extension-description')} full>
              <Textarea
                value={formData.description}
                onInput={(e) => this.handleInputChange('description', (e.target as HTMLTextAreaElement).value)}
                placeholder={t('placeholder-extension-description')}
                rows={3}
              />
            </Field>

            <Field label={`${t('label-extension-source-url')} *`} full>
              <Input
                type="text"
                value={formData.sourceUrl}
                onInput={(e) => this.handleInputChange('sourceUrl', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-source-url')}
              />
            </Field>

            <Field label={t('label-extension-type')}>
              <Select
                value={formData.type}
                onChange={(e) => this.handleInputChange('type', (e.target as HTMLSelectElement).value as CustomExtensionType)}
              >
                <option value="script">{t('option-type-script')}</option>
                <option value="module">{t('option-type-module')}</option>
                <option value="eval">{t('option-type-eval')}</option>
              </Select>
            </Field>

            <Field label={t('label-extension-icon-url')}>
              <Input
                type="text"
                value={formData.icon}
                onInput={(e) => this.handleInputChange('icon', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-icon-url')}
              />
            </Field>

            <Field label={t('label-extension-repository-url')}>
              <Input
                type="text"
                value={formData.repository}
                onInput={(e) => this.handleInputChange('repository', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-repository-url')}
              />
            </Field>

            <Field label={t('label-extension-website-url')}>
              <Input
                type="text"
                value={formData.website}
                onInput={(e) => this.handleInputChange('website', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-website-url')}
              />
            </Field>

            <Field label={t('label-extension-tags')} full>
              <Input
                type="text"
                value={formData.tags}
                onInput={(e) => this.handleInputChange('tags', (e.target as HTMLInputElement).value)}
                placeholder={t('placeholder-extension-tags')}
              />
            </Field>
          </FormGrid>
        </ModalPanel>
      </ModalBackdrop>
    );
  }

  render() {
    const {extensions, showAddForm, error, success} = this.state;

    return (
      <ModalBackdrop className="z-50">
        <ModalPanel
          title={t('button-manage-custom-extensions')}
          subtitle={t('message-custom-extensions-info')}
          actions={<CloseButton
            onClick={this.props.onClose}
            variant="modal"
          />}
          footer={<Button
            onClick={this.props.onClose}
            variant="neutral"
            className="w-full"
          >
            {t('button-close')}
          </Button>}
        >
          {/* Messages */}
          {error && !showAddForm && (
            <Alert>
              {error}
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              {success}
            </Alert>
          )}

          {/* Extensions List */}
          <Panel
            list
            title={`${t('label-custom-extensions')} (${extensions.length})`}
            actions={(
              <Button
                onClick={this.handleAddNew}
                variant="primary"
              >
                + {t('button-add-custom-extension')}
              </Button>
            )}
          >
            {extensions.length === 0 ? (
              <EmptyState title={t('message-no-custom-extensions')}/>
            ) : (
              <div>
                {extensions.map(ext => (
                  <ListRow key={ext.id}>
                    <div className="flex items-start gap-3">
                      {ext.icon && (
                        <img
                          src={ext.icon}
                          alt={ext.name}
                          className="h-10 w-10 flex-none rounded-lg border border-bmm-border bg-bmm-surface-muted object-cover shadow-bmm-control"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[0.96875rem] font-bold leading-snug text-bmm-ink">{ext.name}</h4>
                        <p className="text-[0.8125rem] text-bmm-muted">{t('label-author-by', {author: ext.author})}</p>
                        {ext.description && (
                          <p className="mt-2 text-sm leading-relaxed text-bmm-muted">{ext.description}</p>
                        )}
                        <div className="mt-2 break-all text-[0.8125rem] text-bmm-muted">
                          <span className="font-medium">{t('label-url')}:</span> {ext.sourceUrl}
                        </div>
                        {ext.tags && ext.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {ext.tags.map(tag => (
                              <Badge key={tag}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          onClick={() => this.handleEdit(ext)}
                          variant="primary"
                          size="sm"
                        >
                          {t('button-edit')}
                        </Button>
                        <Button
                          onClick={() => this.handleDelete(ext.id)}
                          variant="danger"
                          size="sm"
                        >
                          {t('button-delete')}
                        </Button>
                      </div>
                    </div>
                  </ListRow>
                ))}
              </div>
            )}
          </Panel>
        </ModalPanel>
        {this.renderFormModal()}
      </ModalBackdrop>
    );
  }
}
