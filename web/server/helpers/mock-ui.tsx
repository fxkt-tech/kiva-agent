import { mock } from "node:test";
import { installMotionMocks } from "./mock-motion";
import {
  cloneElement, createContext, createElement, isValidElement, useContext, useState,
  type ComponentProps, type Context, type ReactElement, type ReactNode,
} from "react";

/* Business tests run without a DOM. Keep the UI boundary controlled and observable;
 * browser acceptance covers the real primitives' portals, focus and keyboard behavior. */
type TestEvent = { defaultPrevented?: boolean; preventDefault?(): void; stopPropagation?(): void; key?: string; target?: unknown; currentTarget?: unknown };
type ChangeDetails = { reason: string; event?: unknown; cancel(): void; isCanceled: boolean; preventUnmountOnClose(): void };
type RootProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?(open: boolean, details: ChangeDetails): void; children?: ReactNode; disablePointerDismissal?: boolean; modal?: boolean | "trap-focus" };
type OverlayState = { open: boolean; change(open: boolean, reason: string, event?: unknown): void; disablePointerDismissal?: boolean };
type RenderProps = Record<string, unknown> & { children?: ReactNode; render?: ReactElement<Record<string, unknown>> | ((props: Record<string, unknown>, state: { open: boolean }) => ReactNode); nativeButton?: boolean };

const defaultOverlay: OverlayState = { open: false, change() {} };

function renderControl(tag: "button" | "div", props: RenderProps, state: OverlayState, onClick: (event: TestEvent) => void) {
  const { render, nativeButton: _nativeButton, children, ...rest } = props;
  const control = { ...rest, onClick, children };
  if (typeof render === "function") return render(control, { open: state.open });
  if (isValidElement(render)) {
    const previousClick = render.props.onClick;
    const targetProps = {
      ...control,
      ...render.props,
      className: [rest.className, render.props.className].filter(Boolean).join(" ") || undefined,
      children: children ?? render.props.children,
      onClick(event: TestEvent) {
        if (typeof previousClick === "function") previousClick(event);
        if (!event.defaultPrevented) onClick(event);
      },
    };
    return cloneElement(render, targetProps);
  }
  return createElement(tag, { ...(tag === "button" ? { type: "button" } : {}), ...control });
}

function overlayMocks(kind: "dialog" | "alertdialog" | "popover" | "menu") {
  const OverlayContext: Context<OverlayState> = createContext(defaultOverlay);
  function Root({ open: controlled, defaultOpen = false, onOpenChange, children, disablePointerDismissal }: RootProps) {
    const [local, setLocal] = useState(defaultOpen);
    const open = controlled ?? local;
    const state: OverlayState = {
      open,
      disablePointerDismissal: kind === "alertdialog" || disablePointerDismissal,
      change(next, reason, event) {
        const details: ChangeDetails = { reason, event, isCanceled: false, cancel() { details.isCanceled = true; }, preventUnmountOnClose() {} };
        onOpenChange?.(next, details);
        if (!details.isCanceled && controlled === undefined) setLocal(next);
      },
    };
    return <OverlayContext value={state}>{children}</OverlayContext>;
  }
  function Trigger(props: RenderProps) {
    const state = useContext(OverlayContext);
    return renderControl("button", { "aria-expanded": state.open, ...props }, state, (event) => {
      if (typeof props.onClick === "function") props.onClick(event);
      if (!props.disabled && !event.defaultPrevented) state.change(!state.open, "trigger-press", event);
    });
  }
  function Close(props: RenderProps) {
    const state = useContext(OverlayContext);
    return renderControl("button", props, state, (event) => {
      if (typeof props.onClick === "function") props.onClick(event);
      if (!props.disabled && !event.defaultPrevented) state.change(false, "close-press", event);
    });
  }
  function Overlay(props: ComponentProps<"div">) {
    const state = useContext(OverlayContext);
    if (!state.open) return null;
    return <div data-slot="dialog-overlay" {...props} onMouseDown={(event) => {
      props.onMouseDown?.(event);
      if (!state.disablePointerDismissal && event.target === event.currentTarget) state.change(false, "outside-press", event);
    }} />;
  }
  function Content({ children, showCloseButton = true, overlayClassName, ...props }: Record<string, unknown> & { children?: ReactNode; showCloseButton?: boolean; overlayClassName?: string }) {
    const state = useContext(OverlayContext);
    if (!state.open) return null;
    const role = kind === "menu" ? "menu" : kind === "alertdialog" ? "alertdialog" : "dialog";
    return <>
      {(kind === "dialog" || kind === "alertdialog") && <Overlay className={overlayClassName ?? "ui-dialog-overlay"} />}
      <div data-slot={kind === "menu" ? "dropdown-menu-content" : kind === "alertdialog" ? "alert-dialog-content" : `${kind}-content`} role={role} aria-modal={kind === "dialog" || kind === "alertdialog" ? "true" : undefined} {...props}>
        {children}
        {(kind === "dialog" || kind === "alertdialog") && showCloseButton && <Close aria-label="关闭对话框">关闭</Close>}
      </div>
    </>;
  }
  function Item({ children, variant: _variant, closeOnClick = true, ...props }: RenderProps & { variant?: string; closeOnClick?: boolean }) {
    const state = useContext(OverlayContext);
    return renderControl("div", { role: "menuitem", "aria-disabled": props.disabled || undefined, ...props, children }, state, (event) => {
      if (props.disabled) return;
      if (typeof props.onClick === "function") props.onClick(event);
      if (closeOnClick && !event.defaultPrevented) state.change(false, "item-press", event);
    });
  }
  return { Root, Trigger, Close, Content, Overlay, Item };
}

const div = (props: ComponentProps<"div">) => <div {...props} />;
const title = (props: ComponentProps<"h2">) => <h2 {...props} />;
const description = (props: ComponentProps<"p">) => <p {...props} />;
const portal = ({ children }: { children?: ReactNode }) => <>{children}</>;

type Scalar = string | number;
type Option = { value: Scalar; label: string; disabled?: boolean };
function select({ value, options, onValueChange, label, placeholder, disabled, loading: _loading, clearable: _clearable, emptyText: _emptyText, size: _size, ...props }: Record<string, unknown> & {
  value: Scalar | null; options: readonly Option[]; onValueChange(value: Scalar | null): void; label?: string; placeholder?: string; disabled?: boolean;
}) {
  return <select {...props} disabled={disabled} aria-label={props["aria-label"] as string | undefined ?? label} value={value ?? ""} onChange={(event) => {
    const option = options.find((item) => String(item.value) === event.target.value);
    onValueChange(option?.value ?? null);
  }}>
    {value === null && <option value="">{placeholder ?? label ?? "请选择"}</option>}
    {options.map((option) => <option key={`${typeof option.value}:${option.value}`} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </select>;
}

const Select = (props: Parameters<typeof select>[0]) => select(props);
const Combobox = (props: Parameters<typeof select>[0]) => select(props);

/** Install before dynamically importing features that consume the UI primitives. */
export function installUiMocks() {
  const dialog = overlayMocks("dialog"), alert = overlayMocks("alertdialog"), popover = overlayMocks("popover"), menu = overlayMocks("menu");
  const controls = [
    ["dialog", { Dialog: dialog.Root, DialogContent: dialog.Content, DialogTrigger: dialog.Trigger, DialogClose: dialog.Close, DialogOverlay: dialog.Overlay, DialogPortal: portal, DialogHeader: div, DialogFooter: div, DialogTitle: title, DialogDescription: description }],
    ["alert-dialog", { AlertDialog: alert.Root, AlertDialogContent: alert.Content, AlertDialogTrigger: alert.Trigger, AlertDialogClose: alert.Close, AlertDialogOverlay: alert.Overlay, AlertDialogPortal: portal, AlertDialogHeader: div, AlertDialogFooter: div, AlertDialogTitle: title, AlertDialogDescription: description, AlertDialogAction: (props: ComponentProps<"button">) => <button type="button" {...props} />, AlertDialogCancel: alert.Close }],
    ["popover", { Popover: popover.Root, PopoverContent: popover.Content, PopoverTrigger: popover.Trigger, PopoverClose: popover.Close, PopoverTitle: title, PopoverDescription: description }],
    ["dropdown-menu", { DropdownMenu: menu.Root, DropdownMenuContent: menu.Content, DropdownMenuTrigger: menu.Trigger, DropdownMenuItem: menu.Item, DropdownMenuSeparator: () => <hr role="separator" /> }],
    ["select", { Select }],
    ["combobox", { Combobox }],
    ["switch", { Switch: ({ checked, onCheckedChange, size: _size, ...props }: ComponentProps<"button"> & { checked: boolean; onCheckedChange(value: boolean): void; size?: string }) => <button type="button" role="switch" aria-checked={checked} {...props} onClick={() => onCheckedChange(!checked)} /> }],
    ["checkbox", { Checkbox: ({ checked, onCheckedChange, indeterminate: _indeterminate, ...props }: ComponentProps<"input"> & { onCheckedChange(value: boolean): void; indeterminate?: boolean }) => <input type="checkbox" checked={checked} {...props} onChange={(event) => onCheckedChange(event.target.checked)} /> }],
  ] as const;
  return [
    installMotionMocks(),
    ...controls.map(([name, namedExports]) => mock.module(new URL(`../../components/ui/${name}.tsx`, import.meta.url).href, { namedExports })),
  ];
}
