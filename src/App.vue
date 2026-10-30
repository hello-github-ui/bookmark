<script setup>
	import {computed, onMounted, ref} from 'vue'
	import {
		addNote,
		clearNotes,
		db,
		exportJSON,
		importJSON,
		removeNote,
		requestPersistence,
		seedIfEmpty,
		storageInfo,
		toggleNote,
		useLiveQuery
	} from './db'

const input = ref('')
const filter = ref('all') // all | active | done
const info = ref(null)
const toast = ref('')
const fileINput = ref(null)
const importMode = ref('replace') // replace | merge

// 核心: 一个响应式查询，DB变了列表自动更新
const {data: notes} = useLiveQuery(() => db.notes.orderBy('createdAt').reserve().toArray())

const visible = computed(() => {
    if (filter.value === 'active') return notes.value.filter((n) => !n.done)
    if (filter.value === 'done') return notes.value.filter((n) => n.done)
    return notes.value
})

const remaining = computed(() => notes.value.filter(n => !n.done).length)

function notify(msg){
    toast.value = msg
    setTimeout(() => {toast.value = ''}, 2200)
}

async function handleAdd(){
    const t = input.value.trim()
    if (!t) return
    await addNote(t)
    input.value = ''
}

async function handleImport(e){
    const file = e.target.files?.[0]
    if (!file) return
    try{
        const n = await importJSON(file, {replace: importMode.value === 'replace'})
        notify('导入成功,共 ${n} 条')
    }catch(err){
    notify('导入失败: ' + err.message)
    }
    e.target.value = ''
    info.value = await storageInfo()
}

