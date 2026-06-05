# HMRC API — Self Assessment Integration, Error Handling, Sandbox Testing & Configuration

## Self Assessment API Integration

### API Client

```java
@RegisterRestClient(configKey = "hmrc-api")
@Path("/individuals/self-assessment")
public interface SelfAssessmentApiClient {

    @GET
    @Path("/income-tax/nino/{nino}/sources")
    @Produces(MediaType.APPLICATION_JSON)
    Uni<SelfEmploymentSources> getSelfEmploymentSources(
        @PathParam("nino") String nino,
        @HeaderParam("Authorization") String bearerToken,
        @HeaderParam("Accept") String accept,
        @Context HttpHeaders fraudHeaders
    );

    @POST
    @Path("/income-tax/nino/{nino}/self-employments")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    Uni<CreateSelfEmploymentResponse> createSelfEmployment(
        @PathParam("nino") String nino,
        @HeaderParam("Authorization") String bearerToken,
        CreateSelfEmploymentRequest request,
        @Context HttpHeaders fraudHeaders
    );

    @PUT
    @Path("/income-tax/nino/{nino}/self-employments/{selfEmploymentId}/periodic/{from}/{to}")
    @Consumes(MediaType.APPLICATION_JSON)
    Uni<Response> submitPeriodicUpdate(
        @PathParam("nino") String nino,
        @PathParam("selfEmploymentId") String selfEmploymentId,
        @PathParam("from") String periodFrom,
        @PathParam("to") String periodTo,
        @HeaderParam("Authorization") String bearerToken,
        PeriodicUpdateRequest request,
        @Context HttpHeaders fraudHeaders
    );

    @POST
    @Path("/income-tax/nino/{nino}/self-employments/{selfEmploymentId}/end-of-period-statements/from/{from}/to/{to}")
    @Consumes(MediaType.APPLICATION_JSON)
    Uni<EndOfPeriodStatementResponse> submitEndOfPeriodStatement(
        @PathParam("nino") String nino,
        @PathParam("selfEmploymentId") String selfEmploymentId,
        @PathParam("from") String periodFrom,
        @PathParam("to") String periodTo,
        @HeaderParam("Authorization") String bearerToken,
        EndOfPeriodStatementRequest request,
        @Context HttpHeaders fraudHeaders
    );
}
```

### Service Layer

```java
@ApplicationScoped
public class HmrcSubmissionService {

    @Inject
    HmrcOAuth2Service oauthService;

    @Inject
    FraudPreventionHeadersGenerator fraudHeadersGenerator;

    @Inject
    DesktopContextProvider contextProvider;

    @Inject
    @RestClient
    SelfAssessmentApiClient apiClient;

    @Inject
    SubmissionRepository submissionRepository;

    /**
     * Submit quarterly periodic update to HMRC.
     */
    @Transactional
    public SubmissionResult submitQuarterlyUpdate(Long userId, QuarterlySubmission submission) {
        String accessToken = oauthService.getValidAccessToken(userId);
        Map<String, String> fraudHeaders = fraudHeadersGenerator.generateHeaders(
            contextProvider.getContext()
        );

        PeriodicUpdateRequest request = mapToPeriodicRequest(submission);

        try {
            Response response = apiClient.submitPeriodicUpdate(
                submission.nino(),
                submission.selfEmploymentId(),
                formatDate(submission.periodFrom()),
                formatDate(submission.periodTo()),
                "Bearer " + accessToken,
                request,
                toHttpHeaders(fraudHeaders)
            ).await().indefinitely();

            if (response.getStatus() == 200 || response.getStatus() == 204) {
                SubmissionRecord record = SubmissionRecord.builder()
                    .userId(userId)
                    .type(SubmissionType.QUARTERLY)
                    .periodFrom(submission.periodFrom())
                    .periodTo(submission.periodTo())
                    .submittedAt(Instant.now())
                    .status(SubmissionStatus.SUCCESS)
                    .build();
                submissionRepository.persist(record);

                return SubmissionResult.success(record);
            } else {
                return handleErrorResponse(response);
            }
        } catch (Exception e) {
            return SubmissionResult.failure(e.getMessage());
        }
    }

    /**
     * Submit annual Self Assessment to HMRC.
     */
    @Transactional
    public SubmissionResult submitAnnualReturn(Long userId, AnnualSubmission submission) {
        // Pre-submission validation
        ValidationResult validation = validateAnnualSubmission(submission);
        if (!validation.isValid()) {
            return SubmissionResult.validationFailed(validation.errors());
        }

        String accessToken = oauthService.getValidAccessToken(userId);
        Map<String, String> fraudHeaders = fraudHeadersGenerator.generateHeaders(
            contextProvider.getContext()
        );

        EndOfPeriodStatementRequest request = mapToEndOfPeriodRequest(submission);

        try {
            EndOfPeriodStatementResponse response = apiClient.submitEndOfPeriodStatement(
                submission.nino(),
                submission.selfEmploymentId(),
                formatDate(submission.taxYearStart()),
                formatDate(submission.taxYearEnd()),
                "Bearer " + accessToken,
                request,
                toHttpHeaders(fraudHeaders)
            ).await().indefinitely();

            SubmissionRecord record = SubmissionRecord.builder()
                .userId(userId)
                .type(SubmissionType.ANNUAL)
                .periodFrom(submission.taxYearStart())
                .periodTo(submission.taxYearEnd())
                .submittedAt(Instant.now())
                .status(SubmissionStatus.SUCCESS)
                .hmrcReference(response.id())
                .build();
            submissionRepository.persist(record);

            return SubmissionResult.success(record);

        } catch (WebApplicationException e) {
            return handleErrorResponse(e.getResponse());
        }
    }

    private SubmissionResult handleErrorResponse(Response response) {
        HmrcErrorResponse error = response.readEntity(HmrcErrorResponse.class);

        return switch (response.getStatus()) {
            case 400 -> SubmissionResult.validationFailed(
                error.errors().stream()
                    .map(e -> e.message())
                    .collect(Collectors.toList())
            );
            case 401 -> SubmissionResult.authenticationFailed(
                "HMRC authentication expired. Please reconnect."
            );
            case 403 -> SubmissionResult.authorizationFailed(
                "Not authorized for this operation."
            );
            case 404 -> SubmissionResult.notFound(error.message());
            default -> SubmissionResult.failure(
                "HMRC error: " + error.message()
            );
        };
    }
}
```

## Error Handling

```java
public record HmrcErrorResponse(
    String code,
    String message,
    List<HmrcFieldError> errors
) {}

public record HmrcFieldError(
    String code,
    String message,
    String path
) {}

// Common HMRC error codes
public enum HmrcErrorCode {
    INVALID_REQUEST("INVALID_REQUEST", "The request is invalid"),
    BUSINESS_ERROR("BUSINESS_ERROR", "Business validation failed"),
    MATCHING_RESOURCE_NOT_FOUND("MATCHING_RESOURCE_NOT_FOUND", "No matching resource found"),
    INTERNAL_SERVER_ERROR("INTERNAL_SERVER_ERROR", "HMRC service error"),
    SERVICE_UNAVAILABLE("SERVICE_UNAVAILABLE", "HMRC service temporarily unavailable"),

    // Fraud prevention errors
    MISSING_FRAUD_HEADER("MISSING_FRAUD_HEADER", "Required fraud header missing"),
    INVALID_FRAUD_HEADER("INVALID_FRAUD_HEADER", "Fraud header format invalid");

    private final String code;
    private final String description;
}
```

## Testing with Sandbox

```java
@QuarkusTest
@TestProfile(HmrcSandboxProfile.class)
class HmrcSubmissionServiceTest {

    @Inject
    HmrcSubmissionService submissionService;

    @Test
    void testQuarterlySubmission() {
        // HMRC sandbox provides test users with specific scenarios
        QuarterlySubmission submission = QuarterlySubmission.builder()
            .nino("AA123456A") // HMRC test NINO
            .selfEmploymentId("XAIS12345678910")
            .periodFrom(LocalDate.of(2025, 4, 6))
            .periodTo(LocalDate.of(2025, 7, 5))
            .income(Money.of(10000))
            .expenses(Money.of(2000))
            .build();

        SubmissionResult result = submissionService.submitQuarterlyUpdate(1L, submission);

        assertThat(result.isSuccess()).isTrue();
    }
}

public class HmrcSandboxProfile implements QuarkusTestProfile {

    @Override
    public Map<String, String> getConfigOverrides() {
        return Map.of(
            "hmrc.base-url", "https://test-api.service.hmrc.gov.uk",
            "hmrc.client-id", "test-client-id",
            "hmrc.client-secret", "test-client-secret"
        );
    }
}
```

## Configuration

```properties
# application.properties

# HMRC API Configuration
hmrc.base-url=https://api.service.hmrc.gov.uk
hmrc.client-id=${HMRC_CLIENT_ID}
hmrc.client-secret=${HMRC_CLIENT_SECRET}
hmrc.redirect-uri=http://localhost:8080/callback
hmrc.scopes=read:self-assessment write:self-assessment

# Sandbox (development)
%dev.hmrc.base-url=https://test-api.service.hmrc.gov.uk
%dev.hmrc.client-id=dev-client-id
%dev.hmrc.client-secret=dev-client-secret

# Test profile
%test.hmrc.base-url=https://test-api.service.hmrc.gov.uk
```

