# danci
next.js 单词后台管理系统和h5应用开发

## 应用形式
- 后台管理系统
- h5应用
- 多端开发

## 亮点
- 数据清洗 （选择、格式化、审核）
- supabase 云端类psql数据库
  关系型数据库
- 支持向量数据库
- 云端 BASS 数据库
  Backend as a service
- ORM 
  不用写sql，不用做数据库的底层处理
  对象关系映射
  todo.save() 保存
  对象和数据库一行记录 对应起来

## 后台管理系统
### 单词书管理
维护单词书，包括单词书的创建、删除、更新、查询等操作。
交给小编管理员
### 管理员管理
- 注册一个超级管理员，一个人
- 添加管理员

/ -> 注册超级管理员页面 -> 登录
/ -> 登录页
      -> 跳转到单词书管理

## shadcn/ui UI 组件库
- 80% 前端组件业务趋同，不用重复造轮子，选用第三方组件库。
- element-ui / ANT Design
- shadcn 定制性很好，tailwindcss配合使用
  语义化，ai 友好
  按需加载
- 目录在 components/ui 目录下

## supabase
BASS 数据库云服务
性能、安全、可扩展性、部署成本几乎为0
- psql embeeding + 关系数据库

**Conventional Commits（约定式提交）** 规范，也是目前最主流的 Git 提交信息风格。
- feat 新增功能
- fix 修复 bug
- docs 文档变更
- refactor 代码重构
- style 样式变更
- test 测试变更
- chore 构建工具变更
coding agent 内置的git 提交

## ORM
- 数据库supabase  已云端创建
.env DATABASE_URL
- next.js 面向对象编程  Object  高级
  不同国家的人
  User  user.save() -> sql insert into
  drizzle orm 映射 翻译
  psql User Table  低级  sql
- drizzle 接手数据库 .env
  不需要建表， 建立schema 映射的就是数据表
  migrate 数据表迁移

## drizzle
ORM 工具 一种，一系列的包和命令
- db目录
  - index.ts 数据库配置
  链接并返回db 数据库操作句柄
  - schema.ts
  对象定义数据表结构
- 配套一系列的脚本
  - generate 生成数据库迁移文件 
    数据库加表，改字段，添索引等
  - migrate 数据库迁移
  - push 数据库推送
  - studio 数据库可视化工具

## words 表
github 下载 zip -> json 文件
  想创建一个words 表，导入这个数据？ json -> sql/csv 直接导入数据库
  ai 上下文 #json 转成csv 格式， 字段....  大量token
  ai 写一段格式转换脚本（少量token），本地运行

## 数据清洗
- 常见的后端功能
scripts/
  解决一些问题 爬虫、数据格式转换等等
ai 来做？ 上下文比较大,上下文窗口限制的，token开销
ai生成一个script 脚本，本地运行
- RLS
  行安全 words 公共表没必要开启
  而 每个用户的背单词记录 需要开启
- prompt执行上下文考虑
  1. 给prompt 提供充足的上下文
  数据表，技术架构，放在Agents.md 文件
  2. 隐藏上下文开销，不让AI 去读文件，给它文件的格式

### 让ai 了解supabase 有books 表 
- 本地建schema
- 后台图书业务
## cascade 级联删除
  外键声明后面加上
  on delete cascade

## Prompt 颗粒度
- 上下文一定要准确且清晰
- 规则或规范，表单字段，业务场景，功能描述
  详细表达，不能让llm 去猜
- llm 擅长的，比如生成代码，让它自己去跑。