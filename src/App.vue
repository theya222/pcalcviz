<template>
  <div id="app">
    <div id="editor-wrapper">
      <button
        ref="calcB"
        value="Calculate"
        @click="calculate"
      >
        Calculate
      </button>
      <div id="editor"/>
    </div>
    <graphviz
      id="xb-arg-map"
      ref="graph"
      class="b-arg-map"
      :hypothesis-id="chunkId"
      :nodes="nodes"
      :text-nodes="textNodes"
      :saved-diagram="savedDiagram"
      :width="width"
      :height="height"
      :get-dlist="getDlist"
    />
  </div>
</template>

<script>
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import CKEditorInspector from '@ckeditor/ckeditor5-inspector';
import graphviz from 'vue-graphviz';
import uuid from 'uuid/v4';
import { Subject } from 'rxjs';
import { debounceTime, mergeMap, groupBy } from 'rxjs/operators';

import Store from './store';
import pmath from './pcalc';

// TODO: investigate getdata definiton, marker.affectsData
export default {
  name: 'App',
  components: {
    graphviz,
  },
  data() {
    return {
      chunkId: null,
      width: 300,
      height: 500,
      id: 3,
      h: 0,
      nodes: [],
      textNodes: [],
      savedDiagram: '',
      saveDisplay: true,
      svgData: undefined,
      graphData: undefined,
      editor: undefined,
      markerChange$: new Subject(),
      store: undefined,
    };
  },
  watch: {
    w() {
      this.width = this.w;
    },
  },
  beforeDestroy() {
    this.editor.destroy();
    this.markerChange$.unsubscribe();
  },
  mounted() {
    const editorConfig = {
      // initialData: `Example probability formulas
      // \`probability of Rain is 20%\` <br>
      // \`probability of SprinklerOn given Rain is 1%\`<br>
      // \`probability of SprinklerOn given no Rain is 40%\`<br>
      // \`probability of WetGrass given no Rain and no SprinklerOn is 0%\`<br>
      // \`probability of WetGrass given Rain and not SprinklerOn is 80%\`<br>
      // \`probability of WetGrass given not Rain and SprinklerOn is 90%\`<br>
      // \`probability of WetGrass given Rain and SprinklerOn is 99%\`<br>
      // eslint-disable-next-line max-len
      // Based on the above probability statements, we can calculate the probability of WetGrass as \`%prob WetGrass\``,
      initialData: '<p>aa</p><p>bb</p><p>`cc`</p>',
      placeholder: 'Text editor',
    };
    this.markerChange$
      .pipe(
        groupBy(event => event.id),
        mergeMap(group$ => group$.pipe(debounceTime((500)))),
      )
      .subscribe(({ id, eventInfo }) => {
        const newText = this.getMarkerText(eventInfo.path[1]);
        this.store.update({
          newText,
          markerId: id,
        });
      });
    ClassicEditor
      .create(document.querySelector('#editor'), editorConfig)
      .then((editor) => {
        CKEditorInspector.attach(editor);
        this.editor = editor;
        this.store = new Store(editor, this.$refs.graph);
        return editor;
      })
      .then((editor) => {
        // bind marker creation/removal events
        editor.model.markers.on('update', (eventInfo, marker, oldRange, newRange) => {
          // if marker is a node
          if (marker.name.substring(0, 5) === 'note:') {
            // if node marker created
            if (oldRange == null) {
              marker.on('change', (e, r, d) => {
                this.markerChange$.next({
                  id: marker.name,
                  eventInfo: e,
                  oldRange: r,
                  data: d,
                });
              });
              this.store.add({
                markerId: marker.name,
                text: this.getMarkerText(marker),
              });
            } else if (newRange == null) {
              // if node marker removed
              marker.off();
              this.store.remove(marker.name);
            }
          }
        });
      })
      .catch(console.error);
    const elem = document.querySelector('#xb-arg-map');
    this.height = elem.clientHeight;
    this.width = elem.clientWidth;
  },
  methods: {
    calculate() {
      const { editor } = this;
      const { model } = editor;
      const { document } = model;
      const root = document.getRoot();

      const startPos = model.createPositionFromPath(root, [0]);
      const endPos = model.createPositionFromPath(root, [root.maxOffset]);

      const range = model.createRange(startPos, endPos);
      const walkerOptions = {
        singleCharacters: true,
        ignoreElementEnd: true,
        shallow: false,
      };
      const walker = range.getWalker(walkerOptions);
      this.parse(walker);
    },
    parse(w) {
      const { editor } = this;
      const { model } = editor;
      let startPos;
      let endPos;
      let invar = false;
      const possibleMarkers = [];
      let numBackticks = 0;
      const createMarkerHelper = (startP, endP) => {
        const id = uuid();
        model.change((writer) => {
          writer.addMarker(`note:${id}`, { range: model.createRange(startP, endP), usingOperation: false });
        });
      };
      // eslint-disable-next-line no-restricted-syntax
      for (const elem of w) {
        if (elem.type && elem.type === 'text') {
          if (invar) {
            if (elem.item.data === '`') {
              numBackticks += 1;
              invar = !invar;
              endPos = elem.nextPosition;
              possibleMarkers.push({ start: startPos, end: endPos });
            }
          } else if (elem.item.data === '`') {
            numBackticks += 1;
            invar = !invar;
            startPos = elem.previousPosition;
          }
        }
      }
      if (numBackticks % 2 === 0) {
        possibleMarkers.forEach(({ start, end }) => {
          createMarkerHelper(start, end);
        });
      } else {
        console.warn('Unclosed backtick present');
      }
    },
    getDlist() {
      pmath.sortfs(pmath.tickconvert(this.editor.getData()).formulas);
      return pmath.Dlist();
    },
    getMarkerText(marker) {
      const { editor } = this;
      const { model } = editor;
      const range = marker.getRange(); // get marker range
      // create selection from range
      const selection = model.change(writer => writer.createSelection(range));
      // get document fragment from selection
      const docFrag = model.getSelectedContent(selection);
      // convert model document fragment to view document fragment
      const view = editor.data.toView(docFrag);
      // convert to DOM document fragment
      const DOMDocFrag = editor.editing.view.domConverter.viewToDom(view, document);
      // serialise to string and replace xmlns attribute
      return new XMLSerializer()
        .serializeToString(DOMDocFrag)
        .replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, '');
    },
  },
};
</script>

<style>
  text {
    font-family: "Source Sans Pro", sans-serif !important;
    font-weight: 100 !important;
  }

  .b-arg-map .graph-unorderedList li {
    vertical-align: middle !important;
    text-align: center !important;
    font-size: 16px !important;
    cursor: pointer;
  }

  .b-arg-map .graph-unorderedList li > span {
    font-size: 16px !important;
    padding: 5px !important;
  }
</style>

<style scoped>
  .b-arg-map {
    right: 0;
    position: absolute;
    width: 50%;
    height: 100%;
    border-style: none none none solid;
  }

  #editor-wrapper {
    left: 0;
    position: absolute;
    width: 50%;
    height: 100%;
  }

</style>
