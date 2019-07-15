import uuid from 'uuid/v4';
import { filter } from 'rxjs/operators';


export default class Store {
  constructor(editor, graph) {
    this.graph = graph;
    this.editor = editor;
    this.markerMap = new Map();
    this.nodes = new Map();

    // watch node text change
    this.graph.rootObservable
      .pipe(filter(action => action.type === 'NODEEDIT'
        && action.prop === 'TEXT'
        && this.nodes.has(action.id.substring(5))
        && this.nodes.get(action.id.substring(5)).text !== action.value))
      .subscribe((action) => {
        this.nodes.get(action.id.substring(5)).text = action.value;
        console.log(action.value);
      });
  }

  add(data) {
    const { text } = data;
    const { markerId } = data;
    const textArr = [...this.nodes.entries()];
    const similarNode = textArr.find(n => n[1].text === text);

    if (similarNode) {
      // if similar node exists add marker to node
      this.nodes.get(similarNode[0])
        .markers
        .push(markerId);
      this.markerMap.set(markerId, similarNode[0]);
    } else {
      // create new nodes internally and on graph
      // create internal node
      const nodeId = uuid();
      const graphNodeId = `note-${nodeId}`;
      this.markerMap.set(markerId, nodeId);
      this.nodes.set(nodeId, { text, markers: [markerId], graphNodeId });
      // create graphviz node
      const newNode = {
        id: graphNodeId,
        text,
      };
      this.graph.rootObservable.next({ type: 'CREATE', newNode });
    }
  }

  update(data) {
    const { newText } = data;
    const { markerId } = data;
    const nodeId = this.markerMap.get(markerId);
    const node = this.nodes.get(nodeId);
    if (node.text !== newText) {
      node.text = newText;
      this.graph.rootObservable.next({
        type: 'NODEEDIT',
        prop: 'TEXT',
        id: node.graphNodeId,
        value: newText,
      });
    }
  }

  remove(markerId) {
    const nodeId = this.markerMap.get(markerId);
    const node = this.nodes.get(nodeId);
    if (node.markers.length === 1) {
      // if only 1 marker links to node, delete node
      this.graph.rootObservable.next({
        type: 'DELETE',
        nodeId: node.graphNodeId,
      });
      this.nodes.delete(nodeId);
    } else {
      // else remove marker reference
      const index = node.markers.indexOf(markerId);
      node.markers.splice(index, 1);
    }
    this.markerMap.delete(markerId);
  }
}
