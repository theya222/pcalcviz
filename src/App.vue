<template>
  <div>
    <div id="app">
      <div id="editor-wrapper">
        <ckeditor id="editor"
                  :editor="editor"
                  v-model="editorData"
                  :config="editorConfig"
        ></ckeditor>
      </div>
        <graphviz id="xb-arg-map"
                  class="b-arg-map"
                  :hypothesisId="chunkId"
                  :nodes="nodes"
                  :textNodes="textNodes"
                  :savedDiagram="savedDiagram"
                  :width="width" :height="height"
        ></graphviz>

    </div>
  </div>
</template>

<script>



  import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
  import graphviz from 'vue-graphviz';
// import pcalc from 'pcalc';

  // console.log(pcalc)

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
      this.height = document.getElementById('xb-arg-map').clientHeight;
      this.width = document.getElementById('xb-arg-map').clientWidth;
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
        saveDisplay: false,
        svgData: undefined,
        graphData: undefined,
        editor: ClassicEditor,
        editorData: '<p>Content of the editor.</p>',
        editorConfig: {
          height: 500,
        },
      };
    },
  };
</script>

<style>
  .b-arg-map .fa {
    font-size: 16px !important;
  }

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
    border-style: none none none solid ;
  }
  body{
    background: aliceblue;
  }
  #editor-wrapper {
    left: 0;
    position: absolute;
    width: 50%;
    height: 100%;
  }

  .ck.ck-editor {
    min-height: 500px;
  }

</style>
