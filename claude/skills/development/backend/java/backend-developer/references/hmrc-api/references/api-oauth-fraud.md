# HMRC API — Endpoints, MTD Timeline, OAuth 2.0 & Fraud-Prevention Headers

## Expertise

### API Endpoints

| API | Purpose | Sandbox | Production |
|-----|---------|---------|------------|
| **OAuth 2.0** | Authentication | `test-api.service.hmrc.gov.uk` | `api.service.hmrc.gov.uk` |
| **Self Assessment (MTD)** | Income Tax submissions | `test-api.service.hmrc.gov.uk` | `api.service.hmrc.gov.uk` |
| **Individual Details** | User information | `test-api.service.hmrc.gov.uk` | `api.service.hmrc.gov.uk` |

### MTD Timeline

| Date | Threshold | Requirement |
|------|-----------|-------------|
| April 2026 | Income > £50,000 | Mandatory MTD |
| April 2027 | Income > £30,000 | Mandatory MTD |
| April 2028 | Income > £20,000 | Mandatory MTD |

### OAuth 2.0 Implementation

#### Registration

1. Register at [HMRC Developer Hub](https://developer.service.hmrc.gov.uk)
2. Create application (sandbox first, then production)
3. Subscribe to required APIs
4. Obtain Client ID and Client Secret

#### OAuth Flow (Authorization Code)

```java
@ApplicationScoped
public class HmrcOAuth2Service {

    private static final String AUTHORIZE_URL = "https://api.service.hmrc.gov.uk/oauth/authorize";
    private static final String TOKEN_URL = "https://api.service.hmrc.gov.uk/oauth/token";

    @ConfigProperty(name = "hmrc.client-id")
    String clientId;

    @ConfigProperty(name = "hmrc.client-secret")
    String clientSecret;

    @ConfigProperty(name = "hmrc.redirect-uri")
    String redirectUri;

    @ConfigProperty(name = "hmrc.scopes")
    String scopes; // "read:self-assessment write:self-assessment"

    @Inject
    TokenRepository tokenRepository;

    /**
     * Generate authorization URL for user to authenticate with Government Gateway.
     */
    public String getAuthorizationUrl(String state) {
        return UriBuilder.fromUri(AUTHORIZE_URL)
            .queryParam("response_type", "code")
            .queryParam("client_id", clientId)
            .queryParam("scope", scopes)
            .queryParam("redirect_uri", redirectUri)
            .queryParam("state", state)
            .build()
            .toString();
    }

    /**
     * Exchange authorization code for access token.
     */
    public HmrcToken exchangeCode(String authorizationCode) {
        Form form = new Form()
            .param("grant_type", "authorization_code")
            .param("code", authorizationCode)
            .param("redirect_uri", redirectUri)
            .param("client_id", clientId)
            .param("client_secret", clientSecret);

        TokenResponse response = ClientBuilder.newClient()
            .target(TOKEN_URL)
            .request(MediaType.APPLICATION_JSON)
            .post(Entity.form(form), TokenResponse.class);

        return HmrcToken.builder()
            .accessToken(response.accessToken())
            .refreshToken(response.refreshToken())
            .expiresAt(Instant.now().plusSeconds(response.expiresIn()))
            .scope(response.scope())
            .build();
    }

    /**
     * Refresh expired access token.
     */
    public HmrcToken refreshToken(String refreshToken) {
        Form form = new Form()
            .param("grant_type", "refresh_token")
            .param("refresh_token", refreshToken)
            .param("client_id", clientId)
            .param("client_secret", clientSecret);

        TokenResponse response = ClientBuilder.newClient()
            .target(TOKEN_URL)
            .request(MediaType.APPLICATION_JSON)
            .post(Entity.form(form), TokenResponse.class);

        return HmrcToken.builder()
            .accessToken(response.accessToken())
            .refreshToken(response.refreshToken())
            .expiresAt(Instant.now().plusSeconds(response.expiresIn()))
            .scope(response.scope())
            .build();
    }

    /**
     * Get valid access token, refreshing if necessary.
     */
    public String getValidAccessToken(Long userId) {
        HmrcToken token = tokenRepository.findByUserId(userId)
            .orElseThrow(() -> new HmrcNotAuthenticatedException("User not connected to HMRC"));

        if (token.isExpired()) {
            token = refreshToken(token.refreshToken());
            tokenRepository.save(token.withUserId(userId));
        }

        return token.accessToken();
    }
}
```

#### Token Storage (Encrypted)

```java
@Entity
@Table(name = "hmrc_tokens")
public class HmrcTokenEntity extends PanacheEntity {

    @Column(name = "user_id", nullable = false, unique = true)
    public Long userId;

    @Column(name = "access_token", nullable = false, length = 2048)
    @Convert(converter = EncryptedStringConverter.class)
    public String accessToken;

    @Column(name = "refresh_token", nullable = false, length = 2048)
    @Convert(converter = EncryptedStringConverter.class)
    public String refreshToken;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "scope")
    public String scope;

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt.minus(Duration.ofMinutes(5)));
    }
}

@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    @Inject
    EncryptionService encryptionService;

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return encryptionService.encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        return encryptionService.decrypt(dbData);
    }
}
```

### Fraud Prevention Headers (MANDATORY)

HMRC **requires** fraud prevention headers on all API calls. Missing headers will result in API access revocation.

```java
@ApplicationScoped
public class FraudPreventionHeadersGenerator {

    /**
     * Generate all required fraud prevention headers for desktop application.
     */
    public Map<String, String> generateHeaders(DesktopContext context) {
        Map<String, String> headers = new LinkedHashMap<>();

        // Connection method - DESKTOP_APP_DIRECT for desktop applications
        headers.put("Gov-Client-Connection-Method", "DESKTOP_APP_DIRECT");

        // Device ID - unique per installation
        headers.put("Gov-Client-Device-ID", context.getDeviceId());

        // User IDs - OS username
        headers.put("Gov-Client-User-IDs",
            "os=" + percentEncode(context.getOsUsername()));

        // Timezone
        headers.put("Gov-Client-Timezone",
            "UTC" + formatTimezoneOffset(context.getTimezoneOffset()));

        // Local IPs (all non-loopback)
        headers.put("Gov-Client-Local-IPs",
            context.getLocalIps().stream()
                .map(this::percentEncode)
                .collect(Collectors.joining(",")));

        // Screen information
        headers.put("Gov-Client-Screens", formatScreenInfo(context.getScreens()));

        // Window size
        headers.put("Gov-Client-Window-Size",
            String.format("width=%d&height=%d",
                context.getWindowWidth(), context.getWindowHeight()));

        // User agent (JavaFX application)
        headers.put("Gov-Client-User-Agent",
            percentEncode(context.getUserAgent()));

        // Multi-factor (if applicable)
        if (context.getMfaMethod() != null) {
            headers.put("Gov-Client-Multi-Factor",
                formatMfaHeader(context.getMfaMethod(), context.getMfaTimestamp()));
        }

        // Vendor information
        headers.put("Gov-Vendor-Version",
            "com.example.taxapp=" + percentEncode(context.getAppVersion()));

        // License ID (if applicable)
        if (context.getLicenseId() != null) {
            headers.put("Gov-Vendor-License-IDs",
                "com.example.taxapp=" + percentEncode(context.getLicenseId()));
        }

        // Product name
        headers.put("Gov-Vendor-Product-Name",
            percentEncode("Example Tax App"));

        return headers;
    }

    private String formatScreenInfo(List<ScreenInfo> screens) {
        return screens.stream()
            .map(s -> String.format(
                "width=%d&height=%d&scaling-factor=%.2f&colour-depth=%d",
                s.width(), s.height(), s.scalingFactor(), s.colourDepth()))
            .collect(Collectors.joining(","));
    }

    private String formatTimezoneOffset(int offsetMinutes) {
        int hours = Math.abs(offsetMinutes) / 60;
        int minutes = Math.abs(offsetMinutes) % 60;
        String sign = offsetMinutes >= 0 ? "+" : "-";
        return String.format("%s%02d:%02d", sign, hours, minutes);
    }

    private String formatMfaHeader(String method, Instant timestamp) {
        return String.format("type=%s&timestamp=%s",
            method, timestamp.toString());
    }

    private String percentEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}

@Dependent
public class DesktopContextProvider {

    public DesktopContext getContext() {
        return DesktopContext.builder()
            .deviceId(getOrCreateDeviceId())
            .osUsername(System.getProperty("user.name"))
            .timezoneOffset(getTimezoneOffsetMinutes())
            .localIps(getLocalIpAddresses())
            .screens(getScreenInfo())
            .windowWidth(getCurrentWindowWidth())
            .windowHeight(getCurrentWindowHeight())
            .userAgent(buildUserAgent())
            .appVersion(getAppVersion())
            .build();
    }

    private String getOrCreateDeviceId() {
        // Load from encrypted local storage or create new UUID
        Path deviceIdPath = Paths.get(System.getProperty("user.home"),
            ".taxapp", "device.id");

        if (Files.exists(deviceIdPath)) {
            return Files.readString(deviceIdPath).trim();
        }

        String deviceId = UUID.randomUUID().toString();
        Files.createDirectories(deviceIdPath.getParent());
        Files.writeString(deviceIdPath, deviceId);
        return deviceId;
    }

    private List<String> getLocalIpAddresses() {
        return NetworkInterface.networkInterfaces()
            .flatMap(NetworkInterface::inetAddresses)
            .filter(addr -> !addr.isLoopbackAddress())
            .filter(addr -> addr instanceof Inet4Address)
            .map(InetAddress::getHostAddress)
            .collect(Collectors.toList());
    }

    private List<ScreenInfo> getScreenInfo() {
        return Screen.getScreens().stream()
            .map(screen -> new ScreenInfo(
                (int) screen.getBounds().getWidth(),
                (int) screen.getBounds().getHeight(),
                screen.getOutputScaleX(),
                24 // JavaFX doesn't expose colour depth
            ))
            .collect(Collectors.toList());
    }

    private String buildUserAgent() {
        return String.format(
            "Example-Tax-App/%s (%s; %s; Java %s; JavaFX %s)",
            getAppVersion(),
            System.getProperty("os.name"),
            System.getProperty("os.version"),
            System.getProperty("java.version"),
            System.getProperty("javafx.version")
        );
    }
}
```

