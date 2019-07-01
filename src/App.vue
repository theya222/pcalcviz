<template>
  <div id="app">
    <div id="editor-wrapper">
      <button ref="calcB" v-on:click="calculate" value="Calculate">Calculate</button>
      <div id="editor"></div>
    </div>
    <graphviz id="xb-arg-map"
              class="b-arg-map"
              :hypothesisId="chunkId"
              :nodes="nodes"
              :textNodes="textNodes"
              :savedDiagram="savedDiagram"
              :width="width" :height="height"
              :get-dlist="getDlist"
    ></graphviz>
  </div>
</template>

<script>
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import CKEditorInspector from '@ckeditor/ckeditor5-inspector';

import graphviz from 'vue-graphviz';
import pmath from './pcalc';


const testProb = `Example probability formulas
\`probability of Rain is 20%\` <br>
\`probability of SprinklerOn given Rain is 1%\`<br>
\`probability of SprinklerOn given no Rain is 40%\`<br>
\`probability of WetGrass given no Rain and no SprinklerOn is 0%\`<br>
\`probability of WetGrass given Rain and not SprinklerOn is 80%\`<br>
\`probability of WetGrass given not Rain and SprinklerOn is 90%\`<br>
\`probability of WetGrass given Rain and SprinklerOn is 99%\`<br>
Based on the above probability statements, we can calculate the probability of WetGrass as \`%prob WetGrass\``;

export default {
  name: 'app',
  components: {
    graphviz,
  },
  watch: {
    w() {
      this.width = this.w;
    },
  },
  mounted() {
    ClassicEditor.create(document.querySelector('#editor'))
      .then((ed) => {
        CKEditorInspector.attach(ed);
        this.editor = ed;
        ed.setData(testProb);
      })
      .catch(console.error);
    const elem = document.querySelector('#xb-arg-map');
    this.height = elem.clientHeight;
    this.width = elem.clientWidth;
  },
  beforeDestroy() {
    this.editor.destroy();
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
    };
  },
  methods: {
    calculate(e) {
      const button = e.target;
      if (button.value === 'Calculate') {
        setTimeout(() => {
          this.editor.setData(pmath.highlight(pmath.calcvars(this.editor.getData())));
          button.value = 'Reset';
        }, 10);
      } else {
        this.editor.setData(pmath.resetcode(this.editor.getData()));
        button.value = 'Calculate';
      }
    },
    getDlist() {
      pmath.sortfs(pmath.tickconvert(this.editor.getData()).formulas);
      return pmath.Dlist();
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
