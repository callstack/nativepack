import {
  openStackFrameInEditorMiddleware,
  openURLMiddleware,
} from '@react-native-community/cli-server-api';
import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

async function devtoolsPlugin(
  instance: FastifyInstance,
  { rootDir }: { rootDir: string }
) {
  instance.use('/open-url', openURLMiddleware);

  instance.use(
    '/open-stack-frame',
    openStackFrameInEditorMiddleware({
      watchFolders: [rootDir],
    })
  );

  instance.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/reload',
    handler: (_request, reply) => {
      instance.wss.messageServer.broadcast('reload');
      reply.send('OK');
    },
  });
}

export default fastifyPlugin(devtoolsPlugin, {
  name: 'devtools-plugin',
  dependencies: ['wss-plugin'],
});
