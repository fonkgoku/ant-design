import * as React from 'react';
import classNames from 'classnames';
import { polyfill } from 'react-lifecycles-compat';
import toArray from 'rc-util/lib/Children/toArray';
import copy from 'copy-to-clipboard';
import omit from 'omit.js';
import { withConfigConsumer, ConfigConsumerProps, configConsumerProps } from '../config-provider';
import LocaleReceiver from '../locale-provider/LocaleReceiver';
import warning from '../_util/warning';
import TransButton from '../_util/transButton';
import ResizeObserver from '../_util/resizeObserver';
import raf from '../_util/raf';
import Icon from '../icon';
import Tooltip from '../tooltip';
import Editable from './Editable';
import { measure } from './util';

export type BaseType = 'secondary' | 'danger' | 'warning';

export interface BaseProps {
  id?: string;
  prefixCls?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  editable?: boolean;
  extendable?: boolean; // Only works when ellipsis
  copyable?: boolean | string;
  onChange?: (value: string) => null;
  type?: BaseType;
  rows?: number;
  disabled?: boolean;

  // decorations
  code?: boolean;
  mark?: boolean;
  underline?: boolean;
  delete?: boolean;
  strong?: boolean;
}

function wrapperDecorations(
  { mark, code, underline, delete: del, strong }: BaseProps,
  content: React.ReactNode,
) {
  let currentContent = content;

  function wrap(needed: boolean | undefined, tag: string) {
    if (!needed) return;

    currentContent = React.createElement(tag, {
      children: currentContent,
    });
  }

  wrap(strong, 'strong');
  wrap(underline, 'u');
  wrap(del, 'del');
  wrap(code, 'code');
  wrap(mark, 'mark');

  return currentContent;
}

interface InternalBaseProps extends BaseProps {
  component: string;
}

interface BaseState {
  edit: boolean;
  copied: boolean;
  ellipsisText: string;
  ellipsisContent: React.ReactNode;
  isEllipsis: boolean;
  extended: boolean;
}

interface Locale {
  edit?: string;
  copy?: string;
  copySuccess?: string;
  extend?: string;
}

const ELLIPSIS_STR = '...';

class Base extends React.Component<InternalBaseProps & ConfigConsumerProps, BaseState> {
  static defaultProps = {
    children: '',
  };

  static getDerivedStateFromProps(nextProps: BaseProps) {
    const { children, editable } = nextProps;

    warning(
      !editable || typeof children === 'string',
      'When `editable` is enabled, the `children` of Text component should use string.',
    );

    return {};
  }

  editIcon?: TransButton;
  content?: HTMLParagraphElement;
  copyId?: number;
  rafId?: number;
  extendStr?: string;

  state: BaseState = {
    edit: false,
    copied: false,
    ellipsisText: '',
    ellipsisContent: null,
    isEllipsis: false,
    extended: false,
  };

  componentDidMount() {
    this.resizeOnNextFrame();
  }

  componentDidUpdate(prevProps: BaseProps) {
    if (this.props.children !== prevProps.children || this.props.rows !== prevProps.rows) {
      this.resizeOnNextFrame();
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.copyId);
    raf.cancel(this.rafId);
  }

  // =============== Extend ===============
  onExtendClick = () => {
    this.setState({ extended: true });
  };

  // ================ Edit ================
  onEditClick = () => {
    this.startEdit();
  };

  onEditChange = (value: string) => {
    const { onChange } = this.props;
    if (onChange) {
      onChange(value);
    }

    this.triggerEdit(false);
  };

  onEditCancel = () => {
    this.triggerEdit(false);
  };

  // ================ Copy ================
  onCopyClick = () => {
    const { children, copyable } = this.props;
    copy(typeof copyable === 'string' ? copyable : String(children));

    this.setState({ copied: true }, () => {
      this.copyId = window.setTimeout(() => {
        this.setState({ copied: false });
      }, 3000);
    });
  };

  setContentRef = (node: HTMLParagraphElement) => {
    this.content = node;
  };

  setEditRef = (node: TransButton) => {
    this.editIcon = node;
  };

  startEdit() {
    this.triggerEdit(true);
  }

  triggerEdit = (edit: boolean) => {
    this.setState({ edit }, () => {
      if (!edit && this.editIcon) {
        this.editIcon.focus();
      }
    });
  };

  // ============== Ellipsis ==============
  resizeOnNextFrame = () => {
    raf.cancel(this.rafId);
    this.rafId = raf(() => {
      // Do not bind `syncEllipsis`. It need for test usage on prototype
      this.syncEllipsis();
    });
  };

  syncEllipsis() {
    const { ellipsisText, isEllipsis, extended } = this.state;
    const { rows, copyable, editable, extendable, children } = this.props;
    if (!rows || rows < 0 || !this.content || extended) return;

    warning(
      toArray(children).every((child: React.ReactNode) => typeof child === 'string'),
      '`ellipsis` for Typography should use string as children only.'
    );

    const offset = {
      iconOffset: 0,
      additionalStr: '',
    };
    if (copyable) offset.iconOffset += 1;
    if (editable) offset.iconOffset += 1;
    if (extendable) offset.additionalStr = this.extendStr || '';

    const { content, text, ellipsis } = measure(this.content, rows, children, this.renderOperations(), ELLIPSIS_STR);
    if (ellipsisText !== text || isEllipsis !== ellipsis) {
      this.setState({ ellipsisText: text, ellipsisContent: content, isEllipsis: ellipsis });
    }
  }

  renderExtend() {
    const { extendable, prefixCls } = this.props;
    const { extended } = this.state;
    if (!extendable || extended) return;

    return (
      <LocaleReceiver key="extend" componentName="Text">
        {({ extend }: Locale) => {
          // To compatible with old react version.
          // Use this to pass extend text for measure usage.
          this.extendStr = extend;

          return (
            <a className={`${prefixCls}-extend`} onClick={this.onExtendClick} aria-label={extend}>
              {extend}
            </a>
          );
        }}
      </LocaleReceiver>
    );
  }

  renderEdit() {
    const { editable, prefixCls } = this.props;
    if (!editable) return;

    return (
      <LocaleReceiver key="edit" componentName="Text">
        {({ edit }: Locale) => {
          return (
            <Tooltip title={edit}>
              <TransButton
                ref={this.setEditRef}
                className={`${prefixCls}-edit`}
                onClick={this.onEditClick}
                aria-label={edit}
              >
                <Icon role="button" type="edit" />
              </TransButton>
            </Tooltip>
          );
        }}
      </LocaleReceiver>
    );
  }

  renderCopy() {
    const { copied } = this.state;
    const { copyable, prefixCls } = this.props;
    if (!copyable) return;

    return (
      <LocaleReceiver key="copy" componentName="Text">
        {({ copy: copyText, copySuccess }: Locale) => {
          const title = copied ? copySuccess : copyText;
          return (
            <Tooltip title={title}>
              <TransButton
                className={classNames(`${prefixCls}-copy`, copied && `${prefixCls}-copy-success`)}
                onClick={this.onCopyClick}
                aria-label={title}
              >
                <Icon role="button" type={copied ? 'check' : 'copy'} />
              </TransButton>
            </Tooltip>
          );
        }}
      </LocaleReceiver>
    );
  }

  renderEditInput() {
    const { children, prefixCls } = this.props;
    return (
      <Editable
        value={typeof children === 'string' ? children : ''}
        onChange={this.onEditChange}
        onCancel={this.onEditCancel}
        prefixCls={prefixCls}
      />
    );
  }

  renderOperations() {
    return [
      this.renderExtend(),
      this.renderEdit(),
      this.renderCopy(),
    ].filter(node => node);
  }

  renderContent() {
    const { ellipsisContent, isEllipsis, extended } = this.state;
    const {
      component: Component,
      children,
      className,
      prefixCls,
      type,
      disabled,
      rows,
      ...restProps
    } = this.props;

    const textProps = omit(restProps, [
      'prefixCls',
      'editable',
      'copyable',
      'extendable',
      'mark',
      'underline',
      'mark',
      'code',
      'delete',
      'underline',
      'strong',
      ...configConsumerProps,
    ]);

    let textNode: React.ReactNode = children;

    if (rows && isEllipsis && !extended) {
      // We move full content to outer element to avoid repeat read the content by accessibility
      textNode = (
        <span title={String(children)} aria-hidden="true">
          {ellipsisContent}{ELLIPSIS_STR}
        </span>
      );
    }

    textNode = wrapperDecorations(this.props, textNode);

    return (
      <ResizeObserver onResize={this.resizeOnNextFrame} disabled={!rows}>
        <Component
          className={classNames(prefixCls, className, {
            [`${prefixCls}-${type}`]: type,
            [`${prefixCls}-disabled`]: disabled,
            [`${prefixCls}-ellipsis`]: rows,
          })}
          aria-label={isEllipsis ? String(children) : undefined}
          ref={this.setContentRef}
          {...textProps}
        >
          {textNode}
          {this.renderOperations()}
        </Component>
      </ResizeObserver>
    );
  }

  render() {
    const { edit } = this.state;

    if (edit) {
      return this.renderEditInput();
    }
    return this.renderContent();
  }
}

polyfill(Base);

export default withConfigConsumer<InternalBaseProps>({
  prefixCls: 'typography',
})(Base);