const noflo = require('noflo');
const {
  findProject,
  findGraph,
  findComponent,
  findByComponent,
} = require('../src/projects');

const buildContext = () => ({
  state: '',
  project: null,
  runtime: null,
  component: null,
  graphs: [],
  remote: [],
});

exports.getComponent = () => {
  const c = new noflo.Component();
  c.inPorts.add('in',
    { datatype: 'object' });
  c.outPorts.add('out',
    { datatype: 'object' });
  c.outPorts.add('error',
    { datatype: 'object' });
  return noflo.helpers.WirePattern(c, {
    async: true,
    forwardGroups: false,
  },
  (data, groups, out, callback) => {
    // Find project
    if (!(data.state.projects != null ? data.state.projects.length : undefined)) {
      callback(new Error('No projects found'));
      return;
    }
    const ctx = buildContext();
    ctx.project = findProject(data.payload.project, data.state.projects);
    if (!ctx.project) {
      callback(new Error(`Project ${data.payload.project} not found`));
      return;
    }

    // Find component if needed
    if (data.payload.component) {
      ctx.component = findComponent(data.payload.component, ctx.project);
      if (!ctx.component) {
        callback(new Error(`Component ${data.payload.component} not found`));
        return;
      }
      ctx.state = 'ok';
      out.send(ctx);
      callback();
      return;
    }

    // Find main graph
    const mainGraph = findGraph(data.payload.graph, ctx.project);
    if (!mainGraph) {
      callback(new Error(`Graph ${data.payload.graph} not found`));
      return;
    }
    ctx.graphs.push(mainGraph);

    // Look up the node tree
    let currentGraph = mainGraph;
    while (data.payload.nodes.length) {
      let type;
      const nodeId = data.payload.nodes.shift();
      if (typeof currentGraph !== 'object') {
        ctx.remote.push(nodeId);
      } else {
        const node = currentGraph.getNode(nodeId);
        if (!node) {
          callback(new Error(`Node ${nodeId} not found`));
          return;
        }
        if (!node.component) {
          callback(new Error(`Node ${nodeId} has no component defined`));
          return;
        }
        [type, currentGraph] = findByComponent(node.component, ctx.project);

        if (type === 'component') {
          ctx.component = currentGraph;
          if (data.payload.nodes.length) {
            callback(new Error(`Component ${nodeId} cannot have subnodes`));
            return;
          }
          break;
        }

        if (type === 'runtime') {
          ctx.remote.push(nodeId);
        } else {
          ctx.graphs.push(currentGraph);
        }
      }
    }

    ctx.state = ctx.remote.length ? 'loading' : 'ok';
    out.send(ctx);

    callback();
  });
};
