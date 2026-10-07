/** 生成 data/bank.json 种子题库：内容来自 interview-prep 的 OS / C++ 面经卡片 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const bank = {
  meta: { name: '面经题库（OS + C++ + UE + LLM + 米哈游 + AI Infra + Agent）', version: 1 },
  topics: [
    { id: 'os', name: '操作系统', note: 'interview-prep/os/操作系统.md' },
    { id: 'cpp', name: 'C++', note: 'interview-prep/language/编程语言.md' },
    { id: 'ue', name: 'UE与游戏工具', note: 'interview-prep/ue/UE与游戏工具.md' },
    { id: 'ai', name: 'LLM应用工程', note: 'interview-prep/ai/LLM应用工程.md' },
    { id: 'mihoyo', name: '米哈游AI工具岗', note: 'interview-prep/mihoyo/米哈游AI工具岗.md' },
    { id: 'aiinfra', name: 'AI Infra', note: 'interview-prep/aiinfra/AI-Infra.md' },
    { id: 'agent', name: 'Agent开发', note: 'interview-prep/agent/Agent开发.md' },
  ],
  notesRoots: ['interview-prep'],
  questions: [
    /* ================= 操作系统 · 单选 ================= */
    {
      type: 'single', topic: 'os', difficulty: 1, tags: ['进程线程'],
      stem: '关于进程和线程，下列说法正确的是？',
      options: [
        '进程是 CPU 调度的基本单位，线程是资源分配的基本单位',
        '线程是 CPU 调度的基本单位，进程是资源分配的基本单位',
        '进程和线程都是资源分配的基本单位',
        '同一进程内的线程拥有完全独立的地址空间',
      ],
      answer: 1,
      analysis: '口诀「进程管资源，线程跑执行」。同进程线程共享地址空间（堆/全局/fd），但各自有独立栈和寄存器。',
      knowledge: '- **进程**是资源分配的基本单位，**线程**是 CPU 调度的基本单位\n- 线程切换无需切换页表/TLB，成本远低于进程切换\n- 线程崩溃会带崩整个进程；进程之间互不影响',
    },
    {
      type: 'single', topic: 'os', difficulty: 2, tags: ['epoll', 'IO复用'],
      stem: 'epoll_wait 相比 select 每次遍历全部 fd，其高效的核心原因是？',
      options: [
        'epoll 使用了更多的内核线程',
        'epoll 把 fd 存在哈希表里',
        '内核只返回就绪的 fd（就绪链表 + 回调机制）',
        'epoll 一次可以监听更多的 CPU 核',
      ],
      answer: 2,
      analysis: 'epoll_create 建红黑树管理 fd，事件到来时回调挂到就绪链表，epoll_wait 只看就绪链表 → O(1)。',
      knowledge: '| | select | epoll |\n|---|---|---|\n| 上限 | 1024 | 无 |\n| 结构 | bitmap | 红黑树+就绪链表 |\n| 复杂度 | O(n) | O(1) |\n\n- LT（水平触发）默认；ET（边沿触发）必须配非阻塞 IO + 循环读到 EAGAIN',
    },
    {
      type: 'single', topic: 'os', difficulty: 2, tags: ['IPC'],
      stem: '通常认为最快的进程间通信方式是？为什么？',
      options: [
        '管道，因为实现最简单',
        '消息队列，因为有格式',
        '共享内存，因为数据不需要在内核态和用户态之间来回拷贝',
        'socket，因为可以全双工',
      ],
      answer: 2,
      analysis: '共享内存多进程映射同一块物理内存，零拷贝；但需要配合信号量/互斥锁做同步。',
      knowledge: '- 管道：半双工、亲缘进程\n- 消息队列：内核消息链表，两次拷贝\n- **共享内存：最快，零拷贝**，需配同步原语\n- socket：可跨主机',
    },
    {
      type: 'single', topic: 'os', difficulty: 2, tags: ['内存管理'],
      stem: 'TLB（Translation Lookaside Buffer）缓存的内容是？',
      options: [
        '最近访问的内存数据',
        '最近使用的虚拟页号 → 物理页号映射（页表项）',
        '磁盘块的地址映射',
        'CPU 指令的译码结果',
      ],
      answer: 1,
      analysis: 'TLB = 页表的 Cache。TLB miss 才走多级页表；进程切换要刷新，ASID 可避免全刷。',
      knowledge: '- MMU 里的**页表项缓存**\n- 命中 → 直接得到物理地址\n- 与 CPU Cache 的区别：缓存对象不同（地址映射 vs 数据）',
    },
    {
      type: 'single', topic: 'os', difficulty: 3, tags: ['缺页'],
      stem: '缺页中断处理程序把所需页面调入内存并更新页表之后，CPU 接下来会？',
      options: [
        '从下一条指令继续执行',
        '重新执行触发缺页的那条指令',
        '向进程发送 SIGSEGV',
        '调度到其他进程',
      ],
      answer: 1,
      analysis: '缺页对指令透明：恢复现场后**重新执行触发缺页的指令**，这次页表项已有效。非法访问才是 SIGSEGV。',
      knowledge: '缺页流程：中断 → 查合法性 → 找空闲页框（无则置换，脏页写回）→ 调页 → 更新页表 → **重执行指令**',
    },
    {
      type: 'single', topic: 'os', difficulty: 3, tags: ['epoll'],
      stem: 'epoll ET（边沿触发）模式为什么必须配合非阻塞 IO 并循环 read 到 EAGAIN？',
      options: [
        '因为 ET 模式不支持阻塞 IO 系统调用',
        '因为 ET 只在状态变化时通知一次，没读完的数据不会再触发通知，会丢失',
        '因为阻塞 IO 在 ET 模式下会死锁',
        '因为 ET 模式下内核缓冲区更大',
      ],
      answer: 1,
      analysis: 'ET 只通知一次；剩余数据若不一次读完（循环 read 直到 EAGAIN），之后再无通知事件 → 数据滞留。',
      knowledge: '- LT：没读完会反复通知（默认）\n- ET：只在「有新数据到来」这一边沿通知一次 → 必须**非阻塞 + 循环读到 EAGAIN**',
    },
    {
      type: 'single', topic: 'os', difficulty: 2, tags: ['锁'],
      stem: '什么场景下适合用自旋锁而不是互斥锁？',
      options: [
        '临界区很长且可能阻塞',
        '临界区极短（几条指令），不值得付出两次上下文切换',
        '线程数远多于 CPU 核数',
        '单核 CPU 系统',
      ],
      answer: 1,
      analysis: '「短等自旋，长等睡眠」。单核上自旋反而让持锁者拿不到 CPU，不合适。',
      knowledge: '- 互斥锁：拿不到 → 睡眠（上下文切换）\n- 自旋锁：拿不到 → 忙等（烧 CPU）\n- 混合方案：先自旋一阵再睡（adaptive mutex）',
    },
    {
      type: 'single', topic: 'os', difficulty: 3, tags: ['死锁'],
      stem: '银行家算法属于哪一类死锁对策？',
      options: [
        '死锁预防（静态破坏必要条件）',
        '死锁避免（运行时判断分配后是否仍处于安全状态）',
        '死锁检测与恢复',
        '鸵鸟策略（忽略死锁）',
      ],
      answer: 1,
      analysis: '银行家算法 = 死锁避免：分配前试探能否找到安全序列，找不到就拒绝请求。',
      knowledge: '- **预防**：一次性申请所有资源 / 资源有序分配（破坏循环等待，工程最常用）\n- **避免**：银行家算法\n- **检测恢复**：资源分配图找环 → 剥夺/杀进程（MySQL 做法）',
    },

    /* ================= 操作系统 · 多选 ================= */
    {
      type: 'multi', topic: 'os', difficulty: 2, tags: ['死锁'],
      stem: '以下哪些是死锁的必要条件？（多选）',
      options: ['互斥', '持有并等待', '不可剥夺', '循环等待', '可抢占'],
      answer: [0, 1, 2, 3],
      analysis: '口诀「互持不剥成环」。「可抢占」恰是破坏「不可剥夺」的手段，不是必要条件。',
      knowledge: '1. 互斥 2. 持有并等待 3. 不可剥夺 4. 循环等待\n\n破坏任意一个即可防死锁：资源有序分配破坏循环等待最常用。',
    },
    {
      type: 'multi', topic: 'os', difficulty: 2, tags: ['IPC'],
      stem: '以下哪些属于进程间通信（IPC）机制？（多选）',
      options: ['管道 (pipe)', '共享内存', '互斥锁 (mutex)', '信号量 (semaphore)', '条件变量'],
      answer: [0, 1, 3],
      analysis: '互斥锁/条件变量是**线程**同步原语（同进程内），不属于 IPC。信号量既可线程同步也可用于进程间（如配合共享内存）。',
      knowledge: 'IPC：管道、消息队列、**共享内存**、信号量、信号、socket\n\n线程同步：mutex、spinlock、rwlock、condition_variable、barrier',
    },
    {
      type: 'multi', topic: 'os', difficulty: 3, tags: ['epoll'],
      stem: 'epoll 相比 select 的优势，以下说法正确的是？（多选）',
      options: [
        '没有 FD_SETSIZE 1024 的数量上限',
        'fd 集合由内核维护，不需要每次调用全量拷贝',
        '只返回就绪的 fd，避免 O(n) 遍历',
        'epoll 是真正的异步 IO，数据由内核拷贝到用户缓冲区',
      ],
      answer: [0, 1, 2],
      analysis: 'epoll 仍是**同步 IO**：就绪后还得自己 read（拷贝阶段阻塞调用线程）。异步 IO 是 AIO/io_uring。',
      knowledge: '- select：bitmap、1024 上限、每次全量拷贝、O(n)\n- epoll：红黑树 + 就绪链表、O(1)、内核维护\n- 前四种 IO 模型都是同步 IO；判断标准 = **拷贝阶段是否阻塞调用线程**',
    },

    /* ================= 操作系统 · 判断 ================= */
    {
      type: 'judge', topic: 'os', difficulty: 1, tags: ['进程线程'],
      stem: '同一进程内的两个线程切换，通常比两个进程切换开销小。',
      answer: true,
      analysis: '同进程线程切换不用换页表、不用刷 TLB，只换栈和寄存器。',
    },
    {
      type: 'judge', topic: 'os', difficulty: 2, tags: ['并发'],
      stem: 'C/C++ 的 volatile 可以用于多线程同步（保证原子性和内存序）。',
      answer: false,
      analysis: 'volatile 只保证「每次真实访存、防编译器优化」，不保证原子性、CPU 可见性与内存序。同步用 std::atomic / 锁 / 内存屏障。',
      knowledge: '- volatile：防优化，适用于 MMIO 寄存器、信号处理器\n- 多线程同步：`std::atomic` + memory_order（acquire/release）',
    },
    {
      type: 'judge', topic: 'os', difficulty: 2, tags: ['锁'],
      stem: '单核 CPU 上使用自旋锁通常不合适。',
      answer: true,
      analysis: '自旋期间持锁者可能被抢占调度走，自旋纯属空烧 CPU。',
    },
    {
      type: 'judge', topic: 'os', difficulty: 2, tags: ['select'],
      stem: '每次调用 select 都需要把整个 fd 集合从用户态拷贝到内核态。',
      answer: true,
      analysis: '这正是 select 的开销来源之一；epoll 的 fd 常驻内核（红黑树），无需重复拷贝。',
    },
    {
      type: 'judge', topic: 'os', difficulty: 3, tags: ['死锁'],
      stem: '系统进入不安全状态，就一定会发生死锁。',
      answer: false,
      analysis: '不安全 ≠ 死锁：只是「可能」死锁。安全状态则一定不会死锁。',
      knowledge: '银行家算法：只在分配后仍存在**安全序列**时才批准请求。',
    },
    {
      type: 'judge', topic: 'os', difficulty: 2, tags: ['IO模型'],
      stem: 'epoll 属于异步 IO 模型。',
      answer: false,
      analysis: 'epoll 是 IO 多路复用（同步 IO 的一种）：它只负责「就绪通知」，read 拷贝仍由调用线程完成。',
    },
    {
      type: 'judge', topic: 'os', difficulty: 2, tags: ['页面置换'],
      stem: 'LFU 对「过去热门、现在变冷」的页面回收效果较差。',
      answer: true,
      analysis: '历史计数累积太高，冷页面迟迟淘汰不掉；LRU/Clock 看「最近」行为更合理。',
      knowledge: 'FIFO（Belady 异常）/ LRU（O(1) 实现：哈希+双向链表）/ LFU / Clock（LRU 近似）/ OPT（理论基准）',
    },
    {
      type: 'judge', topic: 'os', difficulty: 1, tags: ['进程线程'],
      stem: '每个线程拥有自己独立的栈和寄存器上下文。',
      answer: true,
      analysis: '共享：地址空间、堆、全局变量、fd；独立：栈、寄存器、栈顶指针。',
    },

    /* ================= 操作系统 · 问答 ================= */
    {
      type: 'qa', topic: 'os', difficulty: 2, tags: ['进程线程'],
      stem: '请简述进程和线程的区别。',
      answer: '**进程**是资源分配的基本单位，**线程**是 CPU 调度的基本单位。\n- 进程有独立地址空间；同进程线程共享地址空间（堆、全局变量、文件描述符），但各自有独立的栈和寄存器\n- 线程切换无需切换页表/TLB，成本远低于进程切换\n- 线程间通信简单（共享内存）但易出并发问题；进程隔离性好，崩溃互不影响\n- 口诀：进程管资源，线程跑执行',
      analysis: '追问方向：协程和线程的区别？（用户态协作式调度，纳秒级切换）用户态线程 vs 内核态线程？',
      knowledge: '- 调度单位 vs 资源单位\n- 切换成本：线程 << 进程\n- 隔离性：进程强、线程弱\n- 协程：用户态、协作式、一个线程可跑上千协程',
    },
    {
      type: 'qa', topic: 'os', difficulty: 3, tags: ['IPC'],
      stem: '进程间通信有哪些方式？各自的优缺点？',
      answer: '- **管道**：半双工、需亲缘进程；命名管道(FIFO)可无亲缘\n- **消息队列**：内核消息链表、有格式；两次拷贝有开销\n- **共享内存**：**最快**（零拷贝），需配信号量/互斥锁同步\n- **信号量**：计数器，用于同步不传数据\n- **信号**：异步事件通知（SIGKILL 等）\n- **socket**：全双工、可跨主机（Unix domain socket 本地高效）',
      analysis: '追问：共享内存为什么还要配信号量？（数据零拷贝但没有互斥语义）',
      knowledge: '口诀「管消共信号 sock」\n\n| 方式 | 特点 |\n|---|---|\n| 管道 | 半双工 |\n| 消息队列 | 有格式 |\n| 共享内存 | 最快·零拷贝 |\n| socket | 跨主机 |',
    },
    {
      type: 'qa', topic: 'os', difficulty: 3, tags: ['内存管理'],
      stem: '虚拟内存的作用与原理？',
      answer: '每个进程有独立虚拟地址空间，经**页表**映射到物理内存。作用：\n1. **隔离**：进程互不干扰\n2. **扩容**：地址空间可大于物理内存（冷页换出 swap）\n3. **共享**：不同虚拟页可映射同一物理页（共享库）\n4. **按需分配**：访问时才真正分配物理页（lazy）\n多级页表解决页表自身过大的问题；MMU+TLB 加速转换。',
      analysis: '追问：虚拟地址怎么转物理地址？（页表+MMU+TLB）为什么多级页表省内存？',
      knowledge: '口诀「隔离、扩容、共享、按需」\n\n相关：分页(固定4KB·内部碎片) vs 分段(逻辑单位·外部碎片) vs 段页式',
    },
    {
      type: 'qa', topic: 'os', difficulty: 3, tags: ['缺页'],
      stem: '描述一次缺页中断的完整过程。',
      answer: '1. CPU 访问的页不在内存，页表项无效 → 触发缺页中断\n2. 保留现场，进入内核缺页处理程序\n3. 检查访问合法性（越界 → SIGSEGV）\n4. 有空闲页框则分配；没有则按置换算法淘汰一页（脏页先写回）\n5. 从磁盘读入所缺页，更新页表置有效\n6. 恢复现场，**重新执行触发缺页的指令**',
      analysis: '口诀「中断→查合法→找框→调页→重执行」。追问：major/minor fault 区别？',
      knowledge: '置换算法：FIFO / LRU / LFU / Clock / OPT\n\nLRU O(1) 实现：哈希表 + 双向链表',
    },
    {
      type: 'qa', topic: 'os', difficulty: 4, tags: ['IO模型'],
      stem: '简述五种 IO 模型，以及同步 IO 和异步 IO 的本质区别。',
      answer: '1. 阻塞 IO：recv 等到拷贝完成\n2. 非阻塞 IO：无数据立即返回 EWOULDBLOCK，轮询\n3. IO 多路复用：select/poll/epoll 盯多个 fd\n4. 信号驱动 IO：就绪发 SIGIO 再去读\n5. 异步 IO：内核完成「就绪+拷贝到用户缓冲区」才通知\n\n本质区别：**数据从内核拷贝到用户空间这一步是否由调用线程自己做**。前四种都是同步 IO（epoll 就绪后仍要自己 read）；AIO/io_uring 才是异步。',
      analysis: '口诀「阻塞等、非阻塞问、复用盯、信号叫、异步全托管」',
      knowledge: '- Reactor（同步·就绪通知）：Redis/Netty/muduo\n- Proactor（异步·完成通知）：IOCP、io_uring\n- Reactor 通知「可以做」，Proactor 通知「已做完」',
    },
    {
      type: 'qa', topic: 'os', difficulty: 4, tags: ['零拷贝'],
      stem: '什么是零拷贝？sendfile/mmap/splice 分别怎么减少拷贝？',
      answer: '传统 read+send：**4 次拷贝**（磁盘→内核缓冲→用户缓冲→socket 缓冲→网卡）+ 4 次上下文切换。\n- **mmap+write**：用户态映射内核缓冲，省 1 次拷贝\n- **sendfile**：数据全程内核态流转，零用户态拷贝；配合网卡 scatter-gather DMA 可 CPU 零拷贝\n- **splice**：借管道在两个 fd 间搬运，不过用户态\n应用：Kafka、Nginx 都用 sendfile 提吞吐。',
      analysis: '追问：什么时候不能用零拷贝？（数据需要用户态加工时）',
      knowledge: '口诀「read+send 四拷贝，sendfile 不进用户态」',
    },
    {
      type: 'qa', topic: 'os', difficulty: 4, tags: ['并发', '原子'],
      stem: '多核 CPU 上原子操作是如何实现的？volatile 能替代它吗？',
      answer: '- 单核：关中断即可\n- 多核：**缓存一致性协议 (MESI) + lock 前缀指令**（如 lock cmpxchg）锁定 cache line（缓存锁）；不支持时退化锁总线\n- **CAS**：硬件级比较交换，无锁编程基础，循环重试实现原子更新\n- volatile **不能**替代：它只防编译器优化，不保证原子性、可见性、内存序。要用 `std::atomic` + memory_order',
      analysis: '追问：CAS 的 ABA 问题？（版本号解决）自旋 CAS 的开销？',
      knowledge: '- 三大并发问题：竞态、可见性、有序性\n- 内存屏障：禁止重排 + 刷写缓冲\n- acquire/release 建立 happens-before',
    },

    /* ================= 操作系统 · 编程 ================= */
    {
      type: 'code', topic: 'os', difficulty: 2, tags: ['字节序'],
      stem: '用 C/C++ 判断本机是大端还是小端，输出 `little` 或 `big`。',
      answer: '取 `int x=1` 的首字节：是 1 → 小端（低位字节在低地址）；是 0 → 大端。也可用 union 或 `*(char*)&x`。',
      analysis: '网络字节序是大端，用 htonl/ntohl 转换。',
      knowledge: '- 小端：低位字节在低地址（x86/ARM 常用）\n- 大端：高位字节在低地址（网络序）',
      code: {
        lang: 'cpp',
        starter: '#include <cstdio>\n\nint main() {\n    unsigned int x = 1;\n    // TODO: 取 x 的第一个字节，小端输出 little，大端输出 big\n    \n    return 0;\n}\n',
        tests: [{ expected: 'little' }],
      },
    },
    {
      type: 'code', topic: 'os', difficulty: 3, tags: ['线程同步'],
      stem: '两个线程交替打印：线程 A 打印 0，线程 B 打印 1，最终输出 `0101010101`（共 10 个字符）。\n提示：用 mutex + condition_variable，或 atomic + 自旋。',
      answer: '条件变量版本：共享 turn 变量，A 等 turn==0 打印后置 1 并 notify，B 对称。注意用 while 防虚假唤醒。',
      analysis: '追问：为什么判断条件要用 while 而不是 if？（虚假唤醒 spurious wakeup）',
      knowledge: 'condition_variable 三件套：unique_lock + wait(lock, pred) + notify\n\nwait 内部会释放锁并睡眠，被唤醒后重新加锁再检查谓词',
      code: {
        lang: 'cpp',
        starter: '#include <cstdio>\n#include <thread>\n#include <mutex>\n#include <condition_variable>\n\nstd::mutex m;\nstd::condition_variable cv;\nint turn = 0;  // 0 -> 该打 0 的线程, 1 -> 该打 1 的线程\n\n// TODO: 补全两个线程函数与 main，输出 0101010101\n',
        tests: [{ expected: '0101010101' }],
      },
    },
    {
      type: 'code', topic: 'os', difficulty: 3, tags: ['原子'],
      stem: '4 个线程各自把全局计数器加 100000 次，要求最终正确输出 `400000`。',
      answer: '把 `int counter` 换成 `std::atomic<int>`，或对累加段加 mutex。atomic 更轻量（缓存行锁）。',
      analysis: '对比：无同步时会丢更新（竞态）；mutex 版吞吐低于 atomic 版。',
      knowledge: '`std::atomic<int>::fetch_add(1)` 是原子的（lock 前缀 + MESI）',
      code: {
        lang: 'cpp',
        starter: '#include <cstdio>\n#include <thread>\n#include <vector>\n\nint counter = 0;  // TODO: 改造成线程安全的方案\n\nint main() {\n    std::vector<std::thread> ts;\n    for (int i = 0; i < 4; ++i) ts.emplace_back([] {\n        for (int j = 0; j < 100000; ++j) {\n            // TODO: 原子/加锁地自增 counter\n        }\n    });\n    for (auto& t : ts) t.join();\n    std::printf("%d\\n", counter);\n    return 0;\n}\n',
        tests: [{ expected: '400000' }],
      },
    },

    /* ================= C++ · 单选 ================= */
    {
      type: 'single', topic: 'cpp', difficulty: 1, tags: ['内存'],
      stem: 'new/delete 与 malloc/free 最本质的区别是？',
      options: [
        'new 的速度更快',
        'new 会调用构造/析构函数，malloc 只分配裸内存',
        'malloc 不能分配大于 1GB 的内存',
        'new 失败返回 NULL',
      ],
      answer: 1,
      analysis: 'new 是运算符（可重载）、返回具体类型指针、失败抛 bad_alloc、底层调 malloc；malloc 是库函数、返回 void*、失败返 NULL。',
      knowledge: '| | new | malloc |\n|---|---|---|\n| 性质 | 运算符 | 库函数 |\n| 构造析构 | ✅ | ❌ |\n| 失败 | bad_alloc | NULL |\n\nnew[] 必须配 delete[]',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 2, tags: ['虚函数'],
      stem: '基类析构函数通常声明为 virtual 的原因是？',
      options: [
        '虚析构可以加速 delete',
        '不声明为 virtual 也能正确析构派生类',
        '通过基类指针 delete 派生类对象时，非虚析构只调用基类析构，导致派生类资源泄漏',
        '编译器强制要求',
      ],
      answer: 2,
      analysis: 'delete Base* 时动态绑定到 Derived 析构 → 先派生后基类完整回收。不作为基类的类无需虚析构（省 vptr）。',
      knowledge: '- vtable/vptr 机制：一类一表，一对象一指针\n- 构造函数不能是虚函数（vptr 在构造过程中才设置）',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 2, tags: ['智能指针'],
      stem: '关于 unique_ptr，下列说法正确的是？',
      options: [
        '大小是裸指针的两倍',
        '可以拷贝给另一个 unique_ptr',
        '独占所有权、不可拷贝可移动、零开销（大小等于裸指针）',
        '内部维护引用计数',
      ],
      answer: 2,
      analysis: '默认首选 unique_ptr；make_unique 创建。shared_ptr 才有控制块和引用计数。',
      knowledge: '- unique_ptr：独占、零开销\n- shared_ptr：引用计数（原子）、控制块开销\n- weak_ptr：观察不增计数，lock() 提升',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 2, tags: ['智能指针'],
      stem: '两个对象各持 shared_ptr 互相引用导致泄漏，标准解法是？',
      options: [
        '把两边都改成 weak_ptr',
        '把「回指/子指向父」一方改成 weak_ptr，使用时 lock() 提升',
        '手动调用 delete',
        '增加引用计数容量',
      ],
      answer: 1,
      analysis: '环上断一条边即可。weak_ptr 不增计数；lock() 返回 shared_ptr，对象已死则得空指针。',
      knowledge: '循环引用：计数永不归零 → 泄漏\n\nweak_ptr::lock() 是安全访问姿势',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 2, tags: ['STL'],
      stem: 'std::map 的底层数据结构是？',
      options: ['哈希表', '红黑树', 'AVL 树', '跳表'],
      answer: 1,
      analysis: '红黑树 → 按 key 有序、O(log n)、迭代器稳定。unordered_map 才是哈希表（平均 O(1)，rehash 迭代器失效）。',
      knowledge: '| | map | unordered_map |\n|---|---|---|\n| 底层 | 红黑树 | 哈希表 |\n| 有序 | ✅ | ❌ |\n| 查找 | O(log n) | 均 O(1) |',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 2, tags: ['STL'],
      stem: 'GCC (libstdc++) 的 vector 扩容策略大约是原来的多少倍？',
      options: ['1 倍（不扩）', '1.5 倍', '2 倍', '10 倍'],
      answer: 2,
      analysis: 'GCC 2 倍、MSVC 1.5 倍。倍增保证 push_back 摊还 O(1)；1.5 倍让旧内存块更易被复用。',
      knowledge: '扩容 = 新分配 → 元素搬移（noexcept 移动构造则 move）→ 释放旧内存\n\n**扩容后原迭代器/指针/引用全部失效**',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 3, tags: ['拷贝控制'],
      stem: '拷贝构造函数的参数为什么必须是引用？',
      options: [
        '为了性能',
        '按值传参本身就要调用拷贝构造，会无限递归',
        '语法糖，其实可以是指针',
        '为了支持多态',
      ],
      answer: 1,
      analysis: '传值触发拷贝构造 → 又要传值 → 无限递归。所以规定必须传引用（通常 const T&）。',
      knowledge: '拷贝构造触发时机：`A b = a` / 按值传参 / 按值返回（可能被 RVO 优化掉）',
    },
    {
      type: 'single', topic: 'cpp', difficulty: 3, tags: ['虚函数'],
      stem: '构造函数不能是虚函数，根本原因是？',
      options: [
        '语法不允许，没有为什么',
        '构造时对象的 vptr 还没设置好，虚机制无从查表',
        '构造函数是静态绑定的',
        '虚函数表里放不下构造函数',
      ],
      answer: 1,
      analysis: 'vptr 在构造过程中逐层设置（先基类后派生）。析构相反：基类析构应当是虚的。',
      knowledge: '构造/析构中调用虚函数：不发生多态，调用的是**当前层**的版本',
    },

    /* ================= C++ · 多选 ================= */
    {
      type: 'multi', topic: 'cpp', difficulty: 2, tags: ['RAII'],
      stem: '以下哪些是 RAII 思想的典型应用？（多选）',
      options: ['std::lock_guard', 'std::shared_ptr', 'std::fstream', '裸 new/delete 配对', 'std::jthread(C++20)'],
      answer: [0, 1, 2, 4],
      analysis: 'RAII = 资源的获取/释放绑定对象构造/析构。裸 new/delete 是 RAII 要解决的问题本身。',
      knowledge: 'RAII 核心价值：作用域结束自动释放 + **异常安全**（栈展开必析构）',
    },
    {
      type: 'multi', topic: 'cpp', difficulty: 3, tags: ['STL', '迭代器'],
      stem: '关于 STL 迭代器失效，以下说法正确的有？（多选）',
      options: [
        'vector 扩容后，原有迭代器全部失效',
        'vector erase 后，插入点之后的迭代器失效',
        'unordered_map rehash 后，原有迭代器仍然有效',
        'map/set 的 erase 只使被删元素的迭代器失效',
      ],
      answer: [0, 1, 3],
      analysis: 'unordered_map rehash 后**所有迭代器失效**（指向元素的引用不失效）。正确姿势：`it = c.erase(it)`。',
      knowledge: '- vector：怕搬家（扩容全失效）\n- unordered_map：怕重排（rehash 全失效）\n- 红黑树/链表：只坏被删节点',
    },
    {
      type: 'multi', topic: 'cpp', difficulty: 3, tags: ['移动语义'],
      stem: '关于 std::move / 移动语义，正确的说法有？（多选）',
      options: [
        'std::move 把左值表达式转为右值引用，本身不移动任何东西',
        '被 move 后的对象处于「有效但未指定」状态，通常为空，仍可被赋值或析构',
        '右值引用 T&& 可以直接绑定左值',
        '移动构造通常直接接管资源指针，避免深拷贝',
      ],
      answer: [0, 1, 3],
      analysis: '右值引用只能绑右值；绑左值要靠**万能引用**（模板推导中的 T&&）+ std::forward。',
      knowledge: '- move：无条件转右值\n- forward：有条件还原左右值属性（完美转发）\n- 引用折叠：& && → &，&& && → &&',
    },

    /* ================= C++ · 判断 ================= */
    {
      type: 'judge', topic: 'cpp', difficulty: 2, tags: ['移动语义'],
      stem: '被 std::move 过的对象不能再被赋值或析构。',
      answer: false,
      analysis: '处于「有效但未指定」状态：可以安全赋新值、可以析构，只是内容不确定（通常为空）。',
    },
    {
      type: 'judge', topic: 'cpp', difficulty: 2, tags: ['lambda'],
      stem: '无捕获的 lambda 表达式可以隐式转换为普通函数指针。',
      answer: true,
      analysis: '无捕获 → 闭包对象无状态，operator() 等价于自由函数，可转 `void(*)()`。',
    },
    {
      type: 'judge', topic: 'cpp', difficulty: 3, tags: ['STL'],
      stem: 'unordered_map 发生 rehash 后，指向元素的指针和引用也会失效。',
      answer: false,
      analysis: 'C++11 起：rehash 使**迭代器**失效，但指向元素的指针/引用不失效（节点式存储，换桶不换节点）。',
    },
    {
      type: 'judge', topic: 'cpp', difficulty: 2, tags: ['const'],
      stem: 'const 成员函数中可以修改被 mutable 修饰的成员变量。',
      answer: true,
      analysis: 'mutable 表示「逻辑常量性中的可变实现细节」（如缓存、mutex、计数）。',
      knowledge: 'const 成员函数：不改成员（mutable 除外）、只能调 const 成员函数；const 对象只能调 const 成员函数',
    },
    {
      type: 'judge', topic: 'cpp', difficulty: 2, tags: ['STL'],
      stem: 'vector 扩容之后，之前保存的指向元素的原生指针仍然有效。',
      answer: false,
      analysis: '扩容 = 搬迁到新内存，旧块被释放 → 指针/引用/迭代器全部失效。需要稳定地址用 reserve 足量或 deque/list。',
    },
    {
      type: 'judge', topic: 'cpp', difficulty: 2, tags: ['虚函数'],
      stem: '虚函数调用比普通函数调用多一次查虚表的间接寻址开销。',
      answer: true,
      analysis: 'vptr → vtable → 函数指针 → 调用。代价小但阻碍内联；热路径上可考虑 final 帮助去虚化。',
    },

    /* ================= C++ · 问答 ================= */
    {
      type: 'qa', topic: 'cpp', difficulty: 3, tags: ['虚函数'],
      stem: '简述 C++ 虚函数的多态实现原理（vtable/vptr）。',
      answer: '- 每个**含虚函数的类**有一张虚函数表 vtable，按声明顺序存放该类虚函数地址；派生类重写则覆盖对应槽位，新增虚函数追加\n- 每个**对象**首部有 vptr，指向所属类的 vtable（构造过程中逐层设置）\n- 虚调用：对象 vptr → vtable → 按偏移取函数地址 → 调用（动态绑定）\n- 因此基类指针指向派生类对象时，调用的是派生类重写版本\n- 虚析构：保证 `delete Base*` 完整析构派生类',
      analysis: '追问：构造函数里调虚函数会怎样？（调用当前层版本，无多态）为什么构造函数不能虚？（vptr 未就位）',
      knowledge: '口诀「一类一表，一对象一指针，调用时查表跳转」',
    },
    {
      type: 'qa', topic: 'cpp', difficulty: 2, tags: ['智能指针'],
      stem: 'unique_ptr / shared_ptr / weak_ptr 各自的特点和使用场景？',
      answer: '- **unique_ptr**：独占所有权，不可拷贝可移动，零开销（=裸指针大小）；默认首选，make_unique 创建\n- **shared_ptr**：共享所有权，控制块原子引用计数，归零释放；make_shared 一次分配对象+控制块；计数原子安全但对象本身不保证线程安全\n- **weak_ptr**：不增计数的观察者，lock() 提升为 shared_ptr（对象已死得空指针）；解决循环引用',
      analysis: '追问：shared_ptr 计数为什么是原子的？（多线程增减）循环引用怎么断环？（回指方向改 weak）',
      knowledge: '口诀「独占 unique，共享 shared，观察 weak」',
    },
    {
      type: 'qa', topic: 'cpp', difficulty: 4, tags: ['移动语义'],
      stem: '什么是完美转发？std::forward 和 std::move 的区别？',
      answer: '- 万能引用：模板推导中的 `T&&`，左值传入 T 推成 T&，右值传入 T 推成 T（引用折叠 & &&→&）\n- 问题：形参本身有名字是**左值**，直接转发会丢失右值属性\n- **std::forward<T>(x)**：按 T 的推导结果有条件地还原左右值 → 完美转发\n- **std::move(x)**：无条件转右值（本质是 static_cast<T&&>）\n典型应用：emplace_back、make_shared 的变参转发',
      analysis: '追问：move 之后原对象什么状态？（有效但未指定，通常为空）',
      knowledge: '口诀「move 无条件转右值，forward 有条件还原」',
    },
    {
      type: 'qa', topic: 'cpp', difficulty: 3, tags: ['STL'],
      stem: 'vector 为什么按倍数（1.5/2 倍）扩容而不是固定增量？',
      answer: '- 倍增保证 push_back **摊还 O(1)**：n 次 push 总搬移 O(n)\n- 固定增量 k：总搬移 O(n²/k)，摊还 O(n)，不可接受\n- 2 倍：空间增长快；1.5 倍（MSVC）：前几次释放的旧块总和可能被后续复用（0.5+0.75+… ≈ 2 倍），内存碎片更友好\n- 实践：能预估就 reserve，避免反复搬家；扩容后迭代器/指针全部失效',
      analysis: '追问：reserve 和 resize 区别？（容量 vs size+值初始化）',
      knowledge: '搬移时若移动构造 noexcept 则 move 否则 copy（std::move_if_noexcept）',
    },
    {
      type: 'qa', topic: 'cpp', difficulty: 4, tags: ['红黑树'],
      stem: '红黑树有哪些性质？map 为什么选红黑树而不是 AVL 或哈希表？',
      answer: '五条性质：\n1. 节点非红即黑\n2. 根为黑\n3. NIL 叶为黑\n4. 红节点子节点必黑（无连续红）\n5. 任一节点到其所有叶子的路径**黑高相同**\n→ 最长路径 ≤ 2×最短路径，树高 O(log n)\n\n选红黑树：插删只需 O(1) 次旋转级别的调整（AVL 更平衡查询略快但插删旋转多）；且 map 需要**有序遍历**和稳定迭代器（哈希表给不了）。',
      analysis: '口诀「根黑叶黑无红连，黑高一致路不翻倍」。追问：为什么不用 AVL？（写多读少时旋转开销）',
      knowledge: '对比：AVL 严格平衡（查询快、维护贵）；红黑树近似平衡（综合优）→ map/set/epoll 就绪结构的选择',
    },
    {
      type: 'qa', topic: 'cpp', difficulty: 3, tags: ['关键字'],
      stem: '列举 static 在 C++ 中的四种用法。',
      answer: '1. **修饰局部变量**：静态存储期、只初始化一次（C++11 起线程安全 → Meyers 单例），作用域不变\n2. **修饰全局变量/函数**：内部链接，仅本编译单元可见（替代：匿名 namespace）\n3. **静态成员变量**：属于类，所有对象共享，类外定义（constexpr 除外）\n4. **静态成员函数**：无 this，只能访问静态成员，类名可直接调用',
      analysis: '追问：static 全局变量 vs 普通全局变量？（链接性不同）Meyers 单例为何线程安全？（魔法静态量）',
      knowledge: '口诀「变量延命，全局限内，类成员归类，类函数无 this」',
    },

    /* ================= C++ · 编程 ================= */
    {
      type: 'code', topic: 'cpp', difficulty: 3, tags: ['内存', '指针'],
      stem: '实现 `void* myMemmove(void* dst, const void* src, size_t n)`：处理源目区域**重叠**的安全拷贝，并按 main 中的演示输出结果。',
      answer: '重叠时按方向决定拷贝顺序：dst > src 且 dst < src+n → 从**尾**往前拷；否则从头往后。等价于 memmove 的实现。',
      analysis: 'memcpy 对重叠区域是未定义行为；面试常考手写。',
      knowledge: '- memcpy：不处理重叠（UB）\n- memmove：按重叠方向选拷贝次序',
      code: {
        lang: 'cpp',
        starter: '#include <cstdio>\n#include <cstring>\n\nvoid* myMemmove(void* dst, const void* src, size_t n) {\n    // TODO: 处理重叠的拷贝\n    return dst;\n}\n\nint main() {\n    char s[] = "1234567890";\n    myMemmove(s + 2, s, 8);\n    puts(s);\n    return 0;\n}\n',
        tests: [{ expected: '1212345678' }],
      },
    },
    {
      type: 'code', topic: 'cpp', difficulty: 2, tags: ['单例'],
      stem: '实现 Meyers 单例：`Singleton::getInstance()` 返回唯一实例，main 里比较两次获取的地址，输出 `same`。',
      answer: '静态局部变量在首次执行时初始化（C++11 保证线程安全），后续直接返回。结构体含一个成员即可。',
      analysis: '追问：为什么 C++11 起它线程安全？（魔法静态量）其他单例写法的坑？',
      knowledge: 'Meyers 单例 = static 局部变量 + 首次调用初始化\n\n对比：饿汉（启动即建）/ 双检锁（需 atomic 防重排）',
      code: {
        lang: 'cpp',
        starter: '#include <cstdio>\n\nstruct Singleton {\n    // TODO: Meyers 单例\n};\n\nint main() {\n    auto* a = Singleton::getInstance();\n    auto* b = Singleton::getInstance();\n    puts(a == b ? "same" : "different");\n    return 0;\n}\n',
        tests: [{ expected: 'same' }],
      },
    },
    {
      type: 'code', topic: 'cpp', difficulty: 4, tags: ['算法', '页面置换'],
      stem: '用 Python 实现 LRU 缓存 `LRUCache(capacity)`，支持 `get(key)`（不存在返回 -1）与 `put(key, value)`。按 starter 中 main 的操作输出结果。',
      answer: '`collections.OrderedDict`：get/put 后 move_to_end，超容量 popitem(last=False) 淘汰最旧。手写则哈希表+双向链表，两边 O(1)。',
      analysis: '这也是「LRU 页面置换 / Redis 淘汰」的通用底座；面试要求 O(1)。',
      knowledge: 'LRU O(1) = 哈希表（定位） + 双向链表（序）\n\n页面置换里 Clock 算法是它的硬件近似',
      code: {
        lang: 'python',
        starter: 'class LRUCache:\n    def __init__(self, capacity):\n        # TODO\n        pass\n\n    def get(self, key):\n        # TODO\n        pass\n\n    def put(self, key, value):\n        # TODO\n        pass\n\n\ncache = LRUCache(2)\ncache.put(1, 1)\ncache.put(2, 2)\nprint(cache.get(1))\ncache.put(3, 3)       # 淘汰 key 2\nprint(cache.get(2))\nprint(cache.get(3))\n',
        tests: [{ expected: '1\n-1\n3' }],
      },
    },
    /* ================= 新增：UE / LLM / 米哈游 / C++ 补充 ================= */
    {type: "single",topic: "ue",difficulty: 2,tags: ["UE模块"],stem: "关于 UE 的 Runtime 模块和 Editor 模块，下列说法正确的是？",options: ["Editor 模块也会被打进正式游戏包","Runtime 模块可以依赖 UnrealEd 等 Editor-only 模块","打包后的游戏里根本没有 Editor 模块的代码，所以运行时调不到 Editor API","两者没有任何区别，只是目录不同"],answer: 2,analysis: "Editor 模块只在编辑器目标下编译加载；Runtime 进包且不能依赖 Editor-only 模块。双态代码用 WITH_EDITOR 隔离。",knowledge: "- 模块是编译单元（.Build.cs），插件是按目录组织的功能容器\n- Editor 模块只在编辑器编译加载；Runtime 进包\n- WITH_EDITOR / WITH_EDITORONLY_DATA 隔离双态代码"},
    {type: "single",topic: "ue",difficulty: 3,tags: ["UE","GC"],stem: "UE 的 UObject 垃圾回收，下列描述正确的是？",options: ["引用计数方式，循环引用会内存泄漏","标记-清扫：从根集沿 UPROPERTY 引用链标记可达对象","每帧全量扫描所有 C++ 裸指针","和 shared_ptr 的机制完全一致"],answer: 1,analysis: "UE GC 靠反射元数据遍历 UPROPERTY 引用做可达性标记，循环引用不构成问题；但没标 UPROPERTY 的裸 UObject* 不被追踪，可能被回收成悬垂。",knowledge: "- 根集（AddToRoot 等）出发 → 沿 UPROPERTY 标记 → 清扫不可达\n- 循环引用天然可回收（可达性分析不依赖计数）\n- 裸 UObject* 未标 UPROPERTY = 不被追踪"},
    {type: "judge",topic: "ue",difficulty: 2,tags: ["Slate"],stem: "Slate 控件可以在任意工作线程直接创建和修改。",answer: false,analysis: "Slate 状态非线程安全，只能在 Game Thread 创建/修改；工作线程算完要用 AsyncTask(ENamedThreads::GameThread) 切回主线程再刷 UI。",knowledge: "- 编辑器 UI/输入/资产操作都在 Game Thread\n- 异步模式：线程池干活 → 回主线程更新 Slate\n- 长任务用 FSlowTask 提供进度与取消"},
    {type: "qa",topic: "ue",difficulty: 3,tags: ["Editor插件"],stem: "简述写一个简单 UE Editor 窗口插件的主要步骤。",answer: "① 插件骨架（Editor 模块 + .uplugin）；② StartupModule 里 RegisterNomadTabSpawner 注册 Tab；③ Tab lambda 里 SNew(SDockTab) 包自定义 SCompoundWidget（Slate 布局）；④ 业务逻辑（读配置、FHttpModule 异步请求）；⑤ 回调用 AsyncTask 切回 Game Thread 更新控件；⑥ ShutdownModule 反注册。"},
    {type: "single",topic: "ai",difficulty: 2,tags: ["FunctionCalling"],stem: "Function Calling 中，JSON Schema 的核心作用是？",options: ["加快模型推理速度","约束工具参数结构：既是给模型的说明书，也是工程侧校验依据","加密传输参数","替代模型的系统提示词"],answer: 1,analysis: "schema 告诉模型参数的类型/必填/枚举；模型输出的参数必须先过 schema 校验 + 权限检查才能执行。模型只申请，代码执行。",knowledge: "- 模型输出的是「调用意图」，执行永远在工程侧\n- 校验失败 → 错误信息回喂 → 限次重试 → 降级人工"},
    {type: "single",topic: "ai",difficulty: 3,tags: ["幻觉"],stem: "下列哪项【不属于】幻觉的工程缓解手段？",options: ["RAG 引用溯源 + 无依据拒答","结构化输出约束解码","高风险操作人工确认闸门","把 temperature 调到 1.5 增加随机性"],answer: 3,analysis: "缓解幻觉要降随机（低温度）、挂锚（RAG 引用）、约束（schema）、兜底（人工复核）。调高 temperature 只会更飘。",knowledge: "- 检索挂锚、解码约束、校验兜底、人工闸门\n- 幻觉只能约束不能消除：LLM 放建议位，决策留确定性代码"},
    {type: "judge",topic: "ai",difficulty: 3,tags: ["MCP"],stem: "接入了 MCP 协议就自动解决了「工具太多导致 token 消耗大」的问题。",answer: false,analysis: "MCP 只标准化工具/数据源的接入方式（发现、调用、格式），不做路由、裁剪、校验策略——工具一多还是要自己做分层路由 / 按需暴露 schema / 工具 RAG。",knowledge: "- MCP 价值：接入标准化、生态复用、解耦宿主\n- 局限：不管路由裁剪，安全责任仍在宿主"},
    {type: "qa",topic: "ai",difficulty: 2,tags: ["RAG"],stem: "简述 RAG 的基本流程（离线 + 在线）。",answer: "离线：文档切分(chunking) → embedding 向量化 → 存向量库（带来源/版本/权限元数据）。在线：query 向量化 → 检索 top-k（可混合 BM25）→ rerank 重排 → 带来源标注拼进 prompt → LLM 生成并引用溯源。"},
    {type: "single",topic: "mihoyo",difficulty: 2,tags: ["AI-Coding"],stem: "米哈游 AI-Coding 大题中，「结果正确性」约占多少权重？",options: ["100%","约 40%，其余看工程交付/提示词/校验/迭代","约 10%","不看重结果"],answer: 1,analysis: "结果正确性 40%、工程交付 30%、提示词设计 20%、产出校验 30%、异常归因+迭代 10%（按公开拆解）。考怎么驾驭 AI 而不是抄答案。",knowledge: "- 五段式：拆解→提示→校验→兜底→复盘\n- 展示「我在控制 AI」"},
    {type: "judge",topic: "mihoyo",difficulty: 1,tags: ["岗位认知"],stem: "「游戏客户端 AI 工具开发工程师」的主要工作是做游戏内的 AI 怪物和 NPC 行为。",answer: false,analysis: "这是 Gameplay AI。本岗是把 AI 嵌入 UE 编辑器与工业化管线（配置生成、资源辅助、代码辅助、文档问答等），是 C++ 工具工程 + LLM 应用工程。",knowledge: "- 一句话：做「做游戏的人」的 AI 工具\n- 面试狂讲 AI NPC/强化学习 = 岗位理解错误"},
    {type: "qa",topic: "mihoyo",difficulty: 3,tags: ["设计题"],stem: "LLM 生成的 UE 配置/蓝图片段，怎么保证不会把项目搞崩？（答题要点）",answer: "原则：LLM 产物永远当不可信输入。四道闸门：① 沙箱——先进隔离工作区/临时资产，预览用只读副本；② 校验——schema/类型 → 编译（蓝图可编译）→ 规则/命名/依赖检查；③ 回滚——改动走版本控制原子提交，可整体 revert，diff 人工比对；④ 权限——目录级授权 + 破坏性操作二次确认/审批。附加：全程审计日志、生成物打标、灰度先只读建议模式。"},
    {type: "single",topic: "cpp",difficulty: 3,tags: ["内存","new"],stem: "关于 placement new，下列说法正确的是？",options: ["它会自动分配堆内存","它在给定地址上构造对象，不分配内存，需要手动调析构","它只能用于 POD 类型","它是 malloc 的别名"],answer: 1,analysis: "new = operator new(分配) + 构造；placement new 跳过分配，在给定内存上构造，生命周期自己管（手动 p->~T()）。内存池/容器原地搬移/共享内存常用。",knowledge: "- new T(args) 两步：operator new + 构造\n- placement new：new (ptr) T(args)；配 p->~T()\n- 场景：内存池、扩容搬移、共享内存"},
    {type: "judge",topic: "cpp",difficulty: 3,tags: ["STL","string"],stem: "std::string 的 SSO 优化意味着短字符串也会在堆上分配内存。",answer: false,analysis: "SSO（短字符串优化）恰好相反：短串直接存在对象内部的栈缓冲区，零堆分配；长串才走指针+堆。libstdc++ 约 15 字节、libc++ 约 22 字节。",knowledge: "- 短串存自身（栈缓冲），长串才上堆\n- 收益：零分配、缓存友好；代价 sizeof(string) 变大"},
    /* ================= OS/C++ 网络面经补缺 + AI Infra ================= */
    {type: "single",topic: "os",difficulty: 2,tags: ["进程"],stem: "关于进程状态转换，下列说法正确的是？",options: ["阻塞态可以直接转换为运行态","运行态阻塞是被动行为","阻塞态等事件到达后转为就绪态，不会直接回运行态","就绪态可以直接转为阻塞态"],answer: 2,analysis: "阻塞→就绪（事件到达）→ 等调度 → 运行。运行→阻塞是进程主动等 IO/锁。",knowledge: "五态：创建/就绪/运行/阻塞/终止\n阻塞是主动等事件；醒来先进就绪队"},
    {type: "single",topic: "os",difficulty: 3,tags: ["调度"],stem: "Linux CFS（完全公平调度）的核心思想是？",options: ["优先级越高时间片越大","总是运行 vruntime（虚拟运行时间）最小的任务","短任务优先执行","多级反馈队列逐级降级"],answer: 1,analysis: "CFS 按 nice 权重归一化虚拟运行时间，红黑树组织，总挑 vruntime 最小者；追求理想公平 CPU 的平滑近似。",knowledge: "vruntime 按权重归一（nice 每级约 1.25 倍）\n红黑树 O(log n) 挑最小"},
    {type: "single",topic: "os",difficulty: 3,tags: ["fork","COW"],stem: "fork 后父子进程的内存关系，正确的是？",options: ["fork 时完整复制父进程物理内存","父子共享物理页且标为只读，任一方写时按页复制（COW）","子进程内存独立且可写，父进程只读","父子共享同一页表"],answer: 1,analysis: "fork 拷页表不拷内存；页标只读，写时缺页异常触发按页复制——写时复制 COW。",knowledge: "fork 一次调用两次返回（父得 PID 子得 0）\nvfork 共享地址空间，现代被 CFW+posix_spawn 取代"},
    {type: "judge",topic: "os",difficulty: 2,tags: ["进程"],stem: "孤儿进程是指父进程先退出、子进程被 init/systemd 收养的进程，它本身不是需要修复的问题。",answer: true,analysis: "孤儿会被 PID 1 收养并正常回收；真正的问题状态是僵尸进程（已退出但父进程未 wait 回收）。",knowledge: "僵尸：父进程不 wait → 内核保留退出状态占 PID\n守护进程：setsid 脱离终端后台运行"},
    {type: "single",topic: "os",difficulty: 4,tags: ["并发","缓存"],stem: "两个线程分别频繁写各自独立的变量，性能反而随线程数下降，最可能的原因是？",options: ["内存泄漏","伪共享：两变量落在同一条 cache line 导致 MESI 乒乓失效","页错误过多","上下文切换开销"],answer: 1,analysis: "不同变量但同一 64B cache line → 每次写让对方核该行失效。解决：alignas(64)/padding 隔离。",knowledge: "MESI 以 cache line（64B）为单位\n排查 perf c2c；解法对齐隔离"},
    {type: "qa",topic: "os",difficulty: 3,tags: ["条件变量"],stem: "条件变量为什么必须配合 mutex 使用？什么是虚假唤醒？",answer: "不持锁时「检查条件→入睡」之间存在窗口：另一线程可能在这之间改条件并 notify，通知落在入睡之前 → 永远错过（丢失唤醒）。mutex 把检查与入睡变成原子。虚假唤醒：实现层面（futex 重启等）可能无人 notify 也醒，所以必须用谓词/while 循环重查条件，醒来≠条件成立。"},
    {type: "single",topic: "cpp",difficulty: 2,tags: ["类型转换"],stem: "下列关于四种 cast 的说法，正确的是？",options: ["static_cast 会做运行时类型检查","dynamic_cast 用于多态类型的下行转换，失败时指针返回 nullptr","const_cast 可以安全修改任何 const 对象的值","reinterpret_cast 是最安全的转换"],answer: 1,analysis: "dynamic_cast 走 RTTI（要求类有虚函数），引用版失败抛 bad_cast。const_cast 改「本就 const」的对象是 UB；reinterpret_cast 位重解释最危险。",knowledge: "数值 static / 下行 dynamic / 去 const 少用 / 重解释慎用\nC 风格 cast 禁用（不写明意图）"},
    {type: "single",topic: "cpp",difficulty: 4,tags: ["并发","atomic"],stem: "关于 std::atomic 与内存序，下列说法正确的是？",options: ["atomic 变量默认是 relaxed 语义","release 写与 acquire 读配对可建立跨线程的可见性（同步关系）","atomic 可以像 mutex 一样保护多个变量构成的不变式","relaxed 提供完整的顺序保证"],answer: 1,analysis: "默认 seq_cst；release-acquire 配对形成 happens-before，配对点之前的写入对消费者可见。atomic 只保护单个变量，多变量一致性要 mutex。relaxed 只保证原子性不管顺序。",knowledge: "发布/订阅：生产者 store(release)，消费者 load(acquire)\n计数器用 relaxed 即可"},
    {type: "judge",topic: "cpp",difficulty: 3,tags: ["STL","hash"],stem: "unordered_map 的 bucket 数量通常取素数，且负载因子超限时通过 rehash 重新散列，期间迭代器全部失效。",answer: true,analysis: "拉链法哈希表；size > bucket_count × max_load_factor(默认1.0) 时 rehash（桶数取不小于两倍的素数），迭代器失效但引用/指针不失效。",knowledge: "reserve(n) 一次到位避免多次 rehash\noperator[] 不存在会默认插入，at() 抛异常"},
    {type: "qa",topic: "cpp",difficulty: 3,tags: ["协程"],stem: "C++20 协程的 co_await 大致是怎么工作的？为什么说它是无栈协程？",answer: "函数含 co_await/co_yield/co_return 即协程：编译器把局部状态装箱到堆上的帧，挂起时把控制权交还调用者，之后从暂停点恢复。co_await 按 awaiter 三件套工作：await_ready（可免挂起）→ await_suspend（挂起交还控制）→ await_resume（恢复取结果）。无栈：只能在显式 co_await 标记点挂起（对比 goroutine 有栈可任意深度挂起），帧更小但要把暂停点写明。"},
    {type: "single",topic: "aiinfra",difficulty: 2,tags: ["GPU"],stem: "GPU 相对 CPU 的设计取向是？",options: ["延迟导向：大缓存+乱序执行尽快完成单任务","吞吐导向：海量小核+高带宽显存，靠并行度隐藏延迟","专注低功耗单线程性能","主要靠超大三级缓存加速"],answer: 1,analysis: "CPU 延迟导向（分支预测/大缓存/乱序），GPU 吞吐导向（数千小核 SIMT + HBM 带宽），深度学习的稠密矩阵正中其下怀。",knowledge: "训练慢的归因层次：SM 占用率 / 显存带宽 / PCIe 传输 / kernel 间空隙"},
    {type: "single",topic: "aiinfra",difficulty: 3,tags: ["CUDA"],stem: "Warp 分化（branch divergence）伤性能的原因是？",options: ["寄存器数量不够","同一 warp 的 32 线程走不同分支时硬件只能串行执行各路径","共享内存 bank 冲突","显存带宽不足"],answer: 1,analysis: "Warp 是调度最小单位（32 线程同指令）；if/else 分歧 → 路径串行执行、不走的 lanes 空转。优化：按 warp 对齐拆数据、算术掩码替代分支。",knowledge: "SM 是车间，Warp 是最小流水班\n循环边界不对齐也算分歧"},
    {type: "single",topic: "aiinfra",difficulty: 3,tags: ["LLM推理"],stem: "LLM 推理的 Decode 阶段，性能瓶颈通常是？",options: ["Tensor Core 算力不足","显存带宽：每步都要读全部权重和 KV Cache","PCIe 传输","CPU 调度"],answer: 1,analysis: "Decode 每步只算一个 token（GEMV 形态），算力需求低但每 token 都要过一遍权重+KV → 访存 bound。Prefill 才是算力密集（GEMM）。TTFT 看 Prefill，TPOT 看 Decode。",knowledge: "Prefill 吃算力，Decode 吃带宽\n优化：batching 拼请求、量化压 KV、GQA/MQA"},
    {type: "single",topic: "aiinfra",difficulty: 4,tags: ["KVCache"],stem: "PagedAttention（vLLM）主要解决的问题是？",options: ["注意力计算太慢","KV Cache 按最大长度预留连续显存导致碎片、利用率低","模型权重太大","kernel launch 开销"],answer: 1,analysis: "借 OS 分页思想：KV 切固定块、逻辑连续物理离散、按需分配+前缀共享（copy-on-write），碎片近乎消灭 → 同显存 batch 更大、吞吐数倍。",knowledge: "与 continuous batching 互补：一个管显存一个管调度\n块表管理有开销，超长单序列仍是瓶颈"},
    {type: "single",topic: "aiinfra",difficulty: 4,tags: ["注意力"],stem: "FlashAttention 加速的核心手段是？",options: ["把注意力近似为稀疏计算","分块+在线 softmax，中间 N×N 矩阵不落 HBM，显存访问从 O(N²) 降到 O(N)","用 INT4 量化权重","多卡并行切序列"],answer: 1,analysis: "标准注意力的瓶颈是 IO：softmax 中间矩阵写回 HBM 再读。FlashAttention 分块流式计算+running max/sum 增量归一，数值精确等价。",knowledge: "IO-aware 精确注意力；Q 块驻留 SRAM，K/V 分块流过\nFA2/3 改并行切分与 Hopper 异步"},
    {type: "judge",topic: "aiinfra",difficulty: 3,tags: ["serving"],stem: "Continuous Batching 通过让短序列等待同 batch 最长序列一起返回来提高吞吐。",answer: false,analysis: "恰好相反：静态批处理才是「陪跑到最长」。Continuous Batching 做迭代级调度——完成的请求立即出队返回、新请求随时插队，GPU 始终满载。",knowledge: "vLLM = PagedAttention（显存）+ continuous batching（调度）\n抢占：RECOMPUTE vs SWAP 两种代价模型"},
    {type: "qa",topic: "aiinfra",difficulty: 3,tags: ["量化"],stem: "GPTQ / AWQ / GGUF 三大量化路线怎么区分？",answer: "GPTQ：训练后逐层量化，用二阶（Hessian）信息最小化重构误差，对离群值大的层稳，偏 GPU 服务端。AWQ：发现保护约 1% 显著权重通道即可保精度——按激活分布做逐通道缩放再量化，推理快、服务端主流。GGUF：llama.cpp 生态容器格式，K-quant 混合位宽分块量化，CPU/端侧友好。经验：INT4 对常规任务掉点小，长链推理/代码/数学掉点放大，必须拿业务评测集回归；KV Cache 量化（FP8/INT8）是独立战线；QLoRA = 4bit 底座 + LoRA 微调。"},
    /* ================= Agent 开发 ================= */
    {type: "single",topic: "agent",difficulty: 2,tags: ["架构"],stem: "Agent 的经典架构公式是？",options: ["LLM + Prompt + 微调","LLM + Planning + Memory + Tools，外套 Agent Loop","RAG + 向量库 + 提示词","规则引擎 + 知识图谱"],answer: 1,analysis: "Agent = LLM（大脑）+ Planning + Memory + Tools，外面套感知→思考→行动→观察的循环；和 chatbot 的本质区别是有循环、有状态、有副作用。",knowledge: "产品参照：Manus（通用任务）、Devin/Claude Code（编程）\n能力下限是工具，上限是规划"},
    {type: "single",topic: "agent",difficulty: 3,tags: ["ReAct"],stem: "ReAct 循环的工程实现中，下列哪项【不是】必备件？",options: ["最大步数/ token 预算封顶","工具错误的结构化回喂","相同工具+相同参数的循环检测","每步都用大模型全量反思一遍"],answer: 3,analysis: "反思 token 翻倍起，只在失败后/关键节点触发式使用；其余三项加上超时、每步留痕、幂等才是裸循环不翻车的必备件。",knowledge: "终止三件套：完成标志/预算/超时\n错误回喂让模型自纠而不是崩"},
    {type: "single",topic: "agent",difficulty: 3,tags: ["上下文工程"],stem: "关于上下文工程（Context Engineering），正确的说法是？",options: ["就是写得更好的提示词","设计 Agent 每一轮能看到什么信息（取舍与组织整个循环的信息进出）","把全部历史塞满上下文窗口","只在任务开始时设置一次系统提示"],answer: 1,analysis: "prompt 工程优化单次调用怎么说；上下文工程优化循环里信息的增删隔离结构化。经典类比：Agent 是操作系统，LLM 是 CPU，上下文窗口是 RAM——上下文工程即内存管理。",knowledge: "三板斧：compaction 摘要 / 工具输出截断 / 子代理隔离\n长上下文模型仍需要（lost-in-middle + 成本）"},
    {type: "judge",topic: "agent",difficulty: 3,tags: ["记忆"],stem: "Agent 的长期记忆应该把每一轮对话原文都写入库，以保证信息不丢失。",answer: false,analysis: "写入要挑剔：任务完成写总结、失败写教训、偏好经确认后写；全量入库会导致记忆膨胀与污染。每条记忆要带来源/置信度/TTL，检索时设相似度阈值，注入时标注为背景数据而非指令。",knowledge: "记忆污染 = 持久化的 prompt injection\n情景/语义/程序性三层分工"},
    {type: "single",topic: "agent",difficulty: 3,tags: ["多智能体"],stem: "A2A 协议和 MCP 的分工，正确的是？",options: ["A2A 管 agent 用工具，MCP 管 agent 之间协作","MCP 管 agent 接工具/数据源，A2A 管 agent 之间的发现与协作","两者是竞争关系，二选一","A2A 是 MCP 的升级版"],answer: 1,analysis: "MCP 解决 agent↔工具接入标准化；A2A 解决 agent↔agent 互操作（Agent Card 能力发现、任务委托、artifacts 交换）。同系统内直接调用即可，跨组织才需要 A2A。",knowledge: "两者都只定义低层机制，安全委托/信任链要自建\nAgent Card = 能力 JSON 名片"},
    {type: "judge",topic: "agent",difficulty: 2,tags: ["框架"],stem: "LangGraph 相比裸写 while 循环的核心增值是：状态图 + 检查点持久化 + 人在回路钩子。",answer: true,analysis: "图编排让流程显式可存档：断点恢复、时间旅行调试、interrupt 审批。简单线性 ReAct 用官方 SDK 循环更轻；复杂分支+持久化+人审才上图编排。",knowledge: "同类：AutoGen（对话式多体）/CrewAI（角色流水线）/OpenAI Agents SDK（handoff）"},
    {type: "single",topic: "agent",difficulty: 4,tags: ["评测"],stem: "Agent 评测与单次 LLM 调用评测的核心差异是？",options: ["只需评测最终结果的正确率","还要做轨迹级评测：步数、工具选择、循环、错误恢复","只能靠人工打分","用 perplexity 就够了"],answer: 1,analysis: "三层：结果级（验收清单/测试通过率）、轨迹级（trajectory：LLM-as-judge + 规则断言）、组件级（回归）。只测结果不测轨迹会漏掉「结果对但绕 50 步」的成本炸弹。行业现状：89% 组织部署了 agent，仅 11-15% 有系统化评估。",knowledge: "先建金标任务集进 CI；纠错回流成新用例\n特有指标：每任务成本分布、人审介入率"},
    {type: "qa",topic: "agent",difficulty: 4,tags: ["沙箱","安全"],stem: "Agent 执行代码/操作文件的沙箱要怎么设计？（要点）",answer: "分层隔离：① 进程级——独立容器/微 VM（gVisor/Firecracker），默认断网、白名单出网；② 文件系统——工作目录绑定挂载可写、其余只读、敏感路径（凭据/~/.ssh）不可见，磁盘配额；③ 能力级——工具白名单，危险操作（删库/对外发送/花钱）二次确认或禁用，凭据按任务发放用完即焚；④ 资源级——CPU/内存/时长/输出限额防失控烧钱。原则：prompt 是建议不是边界（注入即可绕过），沙箱必须默认拒绝。三问自检：能碰什么文件、能出什么网、能花多少钱。"},
    /* ================= 进程/线程创建过程 ================= */
    {type: "single",topic: "os",difficulty: 3,tags: ["进程创建"],stem: "关于 Linux 进程/线程创建，下列说法正确的是？",options: ["fork 和 pthread_create 底层毫无关联，走完全不同的系统调用","两者都走 clone()，差异由 clone flags 控制共享还是拷贝资源","exec 会创建新进程并分配新 PID","pthread_create 会复制整个页表"],answer: 1,analysis: "clone 是万物创建之源：fork=几乎全拷（页表 COW），pthread=几乎全共享（CLONE_VM 等标志）。exec 不建新进程，只替换地址空间（PID 不变）。",knowledge: "内核步骤：task_struct → PID → 按 flags 拷/共享 mm/files/sighand → 内核栈+改写返回值 → 入就绪队列\nWindows CreateProcess = fork+exec 二合一"},
    {type: "multi",topic: "os",difficulty: 3,tags: ["线程"],stem: "同进程内多线程之间【共享】的资源有哪些？",options: ["地址空间（全局变量/堆）","文件描述符表","每个线程自己的函数调用栈","信号处理函数表"],answer: [0,1,3],analysis: "私有：栈、寄存器/PC、errno、信号屏蔽字、tid；共享：地址空间、fd 表、信号处理函数、cwd。线程崩溃会带崩整个进程。",knowledge: "pthread → clone(CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD…)\n每线程仍有独立 task_struct（/proc 可见，gettid 区分）"},
  ],
}

// 生成稳定 id：q001…qNNN
for (let i = 0; i < bank.questions.length; i++) {
  bank.questions[i].id = `q${String(i + 1).padStart(3, '0')}`
}

const out = path.join(ROOT, 'data', 'bank.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
// 原子写盘（tmp+rename，与 saveBank 一致）：写一半中断不会留下截断 JSON 触发 watcher 报错
const tmp = `${out}.tmp`
fs.writeFileSync(tmp, JSON.stringify(bank, null, 2) + '\n', 'utf8')
fs.renameSync(tmp, out)
const byType = {}
for (const q of bank.questions) byType[q.type] = (byType[q.type] || 0) + 1
console.log(`bank.json written: ${bank.questions.length} questions`, byType)
