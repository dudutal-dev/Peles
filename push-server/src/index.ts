import { handleRequest, runScheduled, type Env } from './app';
import { d1Store } from './store';

export default {
  fetch(request, env) {
    return handleRequest(request, { store: d1Store(env.DB), env });
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled({ store: d1Store(env.DB), env }));
  },
} satisfies ExportedHandler<Env>;
