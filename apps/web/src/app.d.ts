// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {
    interface Locals {}
    interface PageData {
      isAuthenticated?: boolean;
    }
  }
}

export {};
