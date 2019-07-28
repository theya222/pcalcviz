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
        const text = action.value;
        const nodeId = action.id.substring(5);
        const node = this.nodes.get(nodeId);
        node.text = text;
        // edit ckeditor text
        const { model } = editor;
        const markerIdArr = node.markers;
        const markers = markerIdArr.map(markerId => model.markers.get(markerId));
        model.change((writer) => {
          markers.forEach((marker) => {
            const viewFragment = editor.data.processor.toView(text);
            const modelFragment = editor.data.toModel(viewFragment);
            const range = marker.getRange();
            const lastChar = range.end.clone();
            lastChar.path[lastChar.path.length - 1] = lastChar.path[lastChar.path.length - 1] - 1;
            const firstRange = range.clone();
            firstRange.end.path[firstRange.end.path.length - 1] = firstRange.end.path[firstRange.end.path.length - 1] - 1;
            const firstSelection = writer.createSelection(firstRange);
            model.insertContent(modelFragment, lastChar);
            model.deleteContent(firstSelection, { doNotResetEntireContent: true });
            const endPos = marker.getRange()
              .end
              .clone();
            const postEndPos = endPos.clone();
            endPos.path[endPos.path.length - 1] = endPos.path[endPos.path.length - 1] - 1;
            const endRange = writer.createRange(endPos, postEndPos);
            const lastCharSelection = writer.createSelection(endRange);
            model.deleteContent(lastCharSelection, { doNotResetEntireContent: true });
          });
        });
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
      console.log('UPDATE', node.text, newText);
      node.text = newText;
      // edit graphviz Node
      this.graph.rootObservable.next({
        type: 'NODEEDIT',
        prop: 'TEXT',
        id: node.graphNodeId,
        value: newText,
      });
      // update all CKEditor text
      const { model } = this.editor;
      const { editor } = this;
      const markerIdArr = node.markers;
      const markers = markerIdArr.map(id => model.markers.get(id));
      model.change((writer) => {
        markers.forEach((marker) => {
          const viewFragment = editor.data.processor.toView(newText);
          const modelFragment = editor.data.toModel(viewFragment);
          const range = marker.getRange();
          const lastChar = range.end.clone();
          lastChar.path[lastChar.path.length - 1] = lastChar.path[lastChar.path.length - 1] - 1;
          const firstRange = range.clone();
          firstRange.end.path[firstRange.end.path.length - 1] = firstRange.end.path[firstRange.end.path.length - 1] - 1;
          const firstSelection = writer.createSelection(firstRange);
          model.insertContent(modelFragment, lastChar);
          model.deleteContent(firstSelection, { doNotResetEntireContent: true });
          const endPos = marker.getRange()
            .end
            .clone();
          const postEndPos = endPos.clone();
          endPos.path[endPos.path.length - 1] = endPos.path[endPos.path.length - 1] - 1;
          const endRange = writer.createRange(endPos, postEndPos);
          const lastCharSelection = writer.createSelection(endRange);
          model.deleteContent(lastCharSelection, { doNotResetEntireContent: true });
        });
      });

      // model.change((writer) => {
      //   const insertOptions = {
      //     leaveUnmerged: true,
      //     doNotResetEntireContent: true,
      //   };
      //   markers.forEach((marker) => {
      //     const range = marker.getRange();
      //     // range.end.path[range.end.path.length - 1] = range.end.path[range.end.path.length - 1] - 1;
      //     // range.start.path[range.start.path.length - 1] = range.start.path[range.start.path.length - 1] + 1;
      //     const selection = writer.createSelection(range);
      //     // model.deleteContent(selection, { doNotResetEntireContent: true });
      //     model.insertContent(writer.createText(newText), selection);
      //   });
      // });
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
