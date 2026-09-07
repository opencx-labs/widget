import type { WidgetComponentKey } from '@opencx/widget-core';
import type { WidgetComponentType } from './types/components';

export class ComponentRegistry {
  components: WidgetComponentType[] = [];

  constructor(opts: { components?: WidgetComponentType[] }) {
    const { components } = opts;

    if (components) {
      components.forEach((c) => this.register(c));
    }

    if (this.components.length === 0) {
      throw new Error('No components registered');
    }
    if (!this.get('fallback')) {
      throw new Error('No fallback component registered');
    }
  }

  register(component: WidgetComponentType) {
    // Use the same key matching as lookup so the latest renderer is selected.
    const index = this.components.findIndex(
      (c) => c.key.toUpperCase() === component.key.toUpperCase(),
    );
    if (index !== -1) {
      this.components[index] = component;
    } else {
      this.components.push(component);
    }
    return this;
  }

  private get(key: WidgetComponentKey) {
    const c = this.components.find(
      (c) => c.key.toUpperCase() === key.toUpperCase(),
    );
    if (c) return c;
    return null;
  }

  public getComponent(key: string) {
    return this.get(key)?.component;
  }
}
