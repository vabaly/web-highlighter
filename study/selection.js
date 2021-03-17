/**
 * @file 复制这段代码到任意网页的控制台去执行，可以选择网页上任意内容，看看输出是什么
 */

/**
 * 获取文本节点在父元素中的偏移量，这个函数适用于父元素下的元素是任意的树的结构，通过深度优先遍历来计算文本节点在所有文本内容中的偏移量
 * @param {HTMLElement} parentElement 父元素
 * @param {Text} textNode 文本节点
 * @returns 
 */
function getTextNodeOffset (parentElement, textNode) {
    // 栈和循环实现的深度优先遍历
    const nodeStack = [parentElement]
    let currentNode = null
    let offset = 0

    while (currentNode = nodeStack.pop()) {
        // 将子节点加入栈中，注意，子节点中，后面的子节点要先进栈，这样，前面的子节点才能先被取出
        const childNodes = currentNode.childNodes
        for (let index = childNodes.length - 1; index >= 0; index--) {
            const childNode = childNodes[index]
            nodeStack.push(childNode)
        }
        // 遇到文本节点但又不是被搜索的文本节点，说明还没遇到要被搜索的文本节点，但是偏移需要加上遇到的文本节点的长度
        if (currentNode.nodeType === 3 && currentNode !== textNode) {
            offset += currentNode.textContent.length
        } else if (currentNode.nodeType === 3) {
            // 遇到了，那就终止搜索，并且偏移量就是之前累加的遇到过的文本节点总内容的长度
            break
        }
    }

    return offset
}

/**
 * 获取文本节点的位置信息，该位置是由文本节点父元素的位置以及文本在父元素的位置确定的
 * 父元素的位置则是由其标签名，以及其在所有同名标签元素的位置确定的
 * 文本在父元素的位置是由第一个文字在父元素中的位置以及文本的内容长度决定的
 * 这个方法的局限性在于前后两次网页内容必须保持不变，才能精准定位
 * @param {Text} selectedTextNode 被选中的文本节点
 */
function getSelectedTextNodePosition (selectedTextNode) {
    const parentElement = selectedTextNode.parentElement
    const parentTagName = parentElement.tagName
    const similarElements = Array.from((document || document.documentElement).getElementsByTagName(parentTagName))
    const parentIndex = similarElements.indexOf(parentElement)
    const textNodeOffset = getTextNodeOffset(parentElement, selectedTextNode)
    const textNodeLength = selectedTextNode.textContent.length
    
    return {
        parentTagName,
        parentIndex,
        textNodeOffset,
        textNodeLength,
    }
}

/**
 * 存储选中的文本节点的第一个文字在父元素中的位置，以及这个父元素的标签名称，以及在网页中的位置
 * @param {Text[]} selectedTextNodes 选中的文本节点
 */
function storeSelectedNodes (selectedTextNodes) {
    const selectedTextNodePositions = selectedTextNodes.map(selectedTextNode => getSelectedTextNodePosition(selectedTextNode))
    console.log('selectedTextNodePositions', selectedTextNodePositions, selectedTextNodes)
    // 简单的用 localStorage 存一下
    localStorage.setItem('selection', JSON.stringify(selectedTextNodePositions))
}

/**
 * 给节点加上高亮，暂时忽略已经高亮过的节点的处理，有了被选择的节点，这里可以高度定制化，从而实现各种各样的标注需求，
 * 这里仅实现最简单的标注黄色的线的需求
 * @param {Node} node 一个节点
 */
function wrapHighlight (node) {
    const wrapper = document.createElement('span')
    wrapper.style.backgroundColor = 'yellow'
    // 浅拷贝这个节点到 wrapper 里面
    wrapper.appendChild(node.cloneNode(false))
    // 替换掉节点
    node.parentNode.replaceChild(wrapper, node)

    return wrapper
}

/**
 * 如果选区是在相同的文本节点上，那么中间的节点就一个，即将文本节点从开始部分到结束部分独立成的那个文本节点
 * @param {Range} range 选区对象
 * @returns {Array<Node>} 收集的节点
 */
function getNodesIfSameStartEnd (range) {
    const { startContainer, endContainer, startOffset, endOffset } = range

    // 将节点从开始选的位置分为前后两个节点，这是直接在 DOM 上的操作
    // 此操作结束后，startContainer、endContainer 仍指向原节点，只是少了被选中的部分和之后的部分，
    // 因此，被选择的部分的节点是 startContainer 之后的一个节点
    startContainer.splitText(startOffset)

    // 被选择的节点中需要截断没有被选中的部分，这个截断点的位置实际上等于 endOffset - startOffset 的位置
    const selectedContainer = startContainer.nextSibling
    selectedContainer.splitText(endOffset - startOffset)

    return [selectedContainer]
}


/**
 * 这里将采用深度优先算法从 DOM 树根节点开始遍历，收集在选择开始的文本到选择结束的文本之间的所有节点
 * 选择开始的文字的位置如果是在一个文本节点的中间，由于可以通过 Selection 接口知道这个文字在文本节点中的偏移量，也就是第几个文字，
 * 于是便可以使用 .splitText(offset) 将第 offset 个文字一直到原文本节点中的最后一个文字单独弄成一个文本节点，原文本节点就一分为二了，
 * 选择结束的文字的位置同理也能一分为二，这些操作都是直接在 DOM 上操作的
 * 由于选择的时候无论是从前往后选择，还是从后往前选择，浏览器认为被选中的开始的节点都是对文档流进行深度优先遍历时先遇到的节点，结束的节点都是后遇到的节点，
 * 这个机制也使得我们进行深度优先遍历时收集中间的节点变的可行
 * @param {Document|HTMLDocument} rootElement 文档流的根结点
 * @param {Range} range 选区对象
 * @returns {Array<Node>} 收集的节点
 */
function getSelectedNodes (rootElement, range) {
    const { startContainer, startOffset, endContainer, endOffset } = range
    
    // 如果选区的开始节点等于结束节点，并且这个节点的类型是文本类的节点，那么就无须遍历文档流，直接在这个节点中找到选择的文本即可
    if (startContainer === endContainer && startContainer instanceof Text) {
        return getNodesIfSameStartEnd(range)
    }

    // 搞个变量来收集选中的节点
    const selectedNodes = []

    // 当深度优先遍历遍历到选区开始节点时，这个变量就会变成 true，后续遍历的节点都会被收集起来，直到遇到结束节点，这个变量才会变成 false，不再收集
    let withinSelectedRange = false
    // 使用循环和栈的方法来深度优先遍历文档流，这个变量就是栈
    const nodesStack = [rootElement]
    // 这个变量用来取出栈里面的节点
    let currentNode = null

    while ((currentNode = nodesStack.pop())) {
        // 如果这个节点有子节点，那么子节点从后往前依次入栈，这样出栈的时候，文档树中左边的节点将会优先出栈
        const children = currentNode.childNodes

        for (let index = children.length - 1; index >= 0; index--) {
            nodesStack.push(children[index])
        }

        // 对每个节点都做三个判断
        // 1. 是否是选中的开始的节点，是的话，需要将未选中的部分和选中部分分割开来，将选中部分独立成一个文本节点，并收集起来
        // 2. 是否是选区间的文本节点，是的话，收集起来
        // 3. 是否是选中结束的节点，是的话，需要将未选中的部分和选中部分分割开来，将选中部分独立成一个文本节点，并收集起来
        if (currentNode === startContainer) {
            // 只收集文本节点
            if (currentNode.nodeType === 3) {
                currentNode.splitText(startOffset)
                const selectedNode = currentNode.nextSibling
                selectedNodes.push(selectedNode)
            }
            // 此后的节点都是选区内的，要被收集的
            withinSelectedRange = true
        } else if (currentNode === endContainer) {
            if (currentNode.nodeType === 3) {
                currentNode.splitText(endOffset)
                selectedNodes.push(currentNode)
            }
            // 遇到结束节点后就无需继续遍历文档树了，终止循环
            break
        } else if (
            withinSelectedRange &&
            currentNode.nodeType === 3
        ) {
            selectedNodes.push(currentNode)
        }
    }

    return selectedNodes
}

/**
 * 将节点数据还原成真实的文本节点，这里的 textNodeOffset 是指存储时存储的文本相对于父元素的偏移量，
 * 而类似于 startContainer 则是此时此刻的文本节点，startOffset 则是选中的文字相对于该文本节点的偏移量，
 * 这里需要转换
 * @param {{ parentTagName, parentIndex, textNodeOffset }} nodeInfo
 * @returns {{ node: TextNode, offset: number }}
 */
function restoreContainer(nodeInfo) {
    const { parentTagName, parentIndex, textNodeOffset } = nodeInfo
    const parentElement = document.getElementsByTagName(parentTagName)[parentIndex]

    // 同样的使用深度优先遍历方法找出符合条件的文本节点以及偏移量
    const nodeStack = [parentElement]
    
    let currentNode = null
    let currentOffset = 0
    let finalOffset = 0

    while (currentNode = nodeStack.pop()) {
        const childNodes = currentNode.childNodes
        for (let index = childNodes.length - 1; index >= 0; index--) {
            const childNode = childNodes[index]
            nodeStack.push(childNode)
        }

        // 如果遇到了文本节点，则要用相对于父元素的偏移量减去已搜索过的偏移量，作为新的偏移量，即相对于文本节点的
        if (currentNode.nodeType === 3) {
            finalOffset = textNodeOffset - currentOffset
            // 搜索时走过的偏移量就是搜过的所有文本节点的内容长度
            currentOffset += currentNode.textContent.length
            // 如果搜到目前为止，超过了相对于父元素的 offset，说明当前节点就是选择的文本所在的节点，即可终止循环
            if (currentOffset >= textNodeOffset) {
                break
            }
        }
    }

    if (!currentNode) {
        currentNode = parentElement
    }

    return {
        node: currentNode,
        offset: finalOffset
    }
}

// 还原选中的节点
function restoreSelectedNodes () {
    const [startSelectedNode, endSelectNode] = JSON.parse(localStorage.getItem('selection')) || []
    // 将 startSelectedNode 和 endSelectNode 数据还原成选区中 startContainer 和 endContainer 这样的文本元素
    const { node: startContainer, offset: startOffset } = restoreContainer(startSelectedNode)
    const { node: endContainer, offset: endOffset } = restoreContainer(endSelectNode)
    
    return {
        startContainer,
        startOffset,
        endContainer,
        endOffset: endOffset + endSelectNode.textNodeLength,
    }
}

function selection () {
    const rootElement = document || document.documentElement

    // 电脑设备上监听 mouseup 事件，移动设备上则监听 touchend 事件，这里专门针对电脑设备做示例，
    // 每次鼠标松开时，就获取一次页面上可能存在的选区
    rootElement.addEventListener('mouseup', event => {
        // selection 对象，它内部的属性可以从这里查到 https://developer.mozilla.org/zh-CN/docs/Web/API/Selection#properties
        const selection = window.getSelection()
        // console.log('selection', selection)
        // 判断是否有选择内容的方式就是判断选区开始的位置和选区结束的位置是否重叠
        // 注意，这里的重叠并不是指按下鼠标的位置和松开鼠标的位置重叠，
        // 当鼠标在空白处按下时，选区开始的位置会被浏览器选择到鼠标所在节点最近的一块内容所在的地方，
        // 鼠标在空白处松开时，选区结束的位置则仍然会被浏览器选择到鼠标所在节点最近的一块内容所在的地方，
        // 如果这两个选区的位置被浏览器定位到了同一个位置，那么即便鼠标在空白的地方移动一段距离，selection.isCollapsed 仍然是 true，即重叠了，也就是没选择到任何内容
        // 注意，有时候当鼠标在空白处重复点击两下时，selection.isCollapsed 是 false，虽然此时看起来什么都没选中，但是确实选中了一个回车和换行，估计这是浏览器的快速选择的功能
        const isSelectedContent = selection.isCollapsed === false
        // console.log('selection.isCollapsed', selection.isCollapsed)
        if (isSelectedContent) {
            // 选择范围的对象
            const range = selection.getRangeAt(0)
            // console.log('range', range)
            // 返回当前选区的纯文本内容，即纯文字，包括回车符等
            // const plainText = range.toString()
            // console.log('select plainText', plainText, encodeURIComponent(plainText))
            // 遍历 DOM 并且收集在选区开始和选区结束的所有文本节点
            const selectedNodes = getSelectedNodes(rootElement, range)
            // 存储：将这些文本节点的父元素以及文本在父元素中的偏移量记录下来
            storeSelectedNodes([selectedNodes[0], selectedNodes[selectedNodes.length - 1]])
            // console.log('selectedNodes', selectedNodes)
            // 将选中的所有节点包裹一层父组件添加样式
            selectedNodes.forEach(node => wrapHighlight(node))
        }
    })

    // 如果本地存储了，则从本地存储中还原数据
    if (localStorage.getItem('selection')) {
        const range = restoreSelectedNodes()
        const selectedNodes = getSelectedNodes(rootElement, range)
        selectedNodes.forEach(node => wrapHighlight(node))
    }
}

selection()