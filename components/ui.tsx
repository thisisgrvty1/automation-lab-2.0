
import React from 'react';
import type { ReactNode } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    const baseClasses = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50 disabled:pointer-events-none";
    
    const variantClasses = {
      primary: "bg-white text-black dark:bg-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700",
      secondary: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600",
      ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
      danger: "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700",
    };

    const sizeClasses = {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
    };

    return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} ref={ref} {...props} />;
  }
);

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm ${className}`}
      {...props}
    />
  )
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={`flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={`flex min-h-[80px] w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 resize-y ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);


interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    value: number;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
    ({ className, label, value, ...props }, ref) => {
      return (
        <div className="grid gap-2">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium">{label}</label>
                <span className="text-sm text-gray-500 dark:text-gray-400">{value}</span>
            </div>
            <input
                type="range"
                ref={ref}
                value={value}
                className={`w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-600 dark:accent-gray-400 ${className}`}
                {...props}
            />
        </div>
      );
    }
  );

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    size?: 'md' | 'lg' | 'xl';
}
  
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'lg' }) => {
    if (!isOpen) return null;
    
    const sizeClasses = {
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
    }
  
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" onClick={onClose}>
        <Card className={`w-full ${sizeClasses[size]} mx-4`} onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full w-8 h-8 -mr-2 -mt-2">&times;</Button>
                </div>
                {children}
            </div>
        </Card>
      </div>
    );
};

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    onConfirm: () => void;
    confirmText?: string;
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, description, onConfirm, confirmText = "Confirm" }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" onClick={onClose}>
            <Card className="w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6">{description}</p>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="danger" onClick={onConfirm}>{confirmText}</Button>
                    </div>
                </div>
            </Card>
      </div>
    );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    children: ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <select
                className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 ${className}`}
                ref={ref}
                {...props}
            >
                {children}
            </select>
        );
    }
);

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, ...props }, ref) => {
        return (
            <input
                type="checkbox"
                ref={ref}
                className={`h-4 w-4 shrink-0 rounded-sm border border-gray-300 dark:border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
                {...props}
            />
        )
    }
);
