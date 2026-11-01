# 数据与隐私 / Data and privacy

- 书签：扩展读取并管理专属 Yiu's tab 文件夹，显示其中的网站，并在用户开启同步后同步该文件夹。无关书签不作为扩展网站列表同步。
- 本地数据：外观设置、排序、图片和缓存保存在扩展本地存储中。
- 图标请求：自动来源访问所收藏的网站及其声明的图标资源；用户选择第三方图标服务时，向配置的接口发送域名或网址；选择 App Store 时向 Apple 请求匹配结果和图片。
- WebDAV：默认关闭。启用后，书签网址、配置和图片发送到用户指定的服务器。账号和应用密码不进入配置备份或云端配置；如选择记住凭据，则保存在当前设备。
- 备份：导出的 JSON 包含网站列表、配置和图片，用户自行保管。
- 权限：`bookmarks` 用于专属书签文件夹；`storage` 用于本地配置；`alarms` 用于后台同步；`offscreen` 用于观察系统主题；HTTP/HTTPS 主机权限用于用户配置的网站图标和 WebDAV 地址。
- 本项目未设置开发者自有的遥测、广告或数据收集端点。

The extension stores configuration and artwork locally. External requests are limited to icon acquisition and user-configured WebDAV synchronization. WebDAV is disabled by default, and credentials are excluded from exported and cloud configuration. Backups contain website information and images. No developer-operated analytics or advertising endpoint is configured.
