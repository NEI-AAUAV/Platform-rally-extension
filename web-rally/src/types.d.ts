// Minimal TypeScript declarations for Rally web
declare module "react" {
  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export const ComponentProps: any;
}

declare module "react-router-dom" {
  export const Link: any;
  export const Navigate: any;
  export const useLocation: any;
}

declare module "@tanstack/react-query" {
  export const useQuery: any;
  export const useMutation: any;
}

declare module "@hookform/resolvers/zod" {
  export const zodResolver: any;
}

declare module "react-hook-form" {
  export const useForm: any;
}

declare module "zod" {
  export const z: any;
}

declare module "lucide-react" {
  export const Users: any;
  export const MapPin: any;
  export const Edit: any;
  export const Trash2: any;
  export const GripVertical: any;
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

// Global JSX namespace
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
  
  namespace React {
    interface DragEvent<T = Element> {
      dataTransfer: DataTransfer;
      preventDefault(): void;
    }
  }
}

// Export JSX namespace
export namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
