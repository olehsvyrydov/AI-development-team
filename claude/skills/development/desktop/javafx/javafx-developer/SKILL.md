---
name: javafx-developer
description: "[Extends backend-developer/frontend-developer] JavaFX 21+ desktop application specialist. Use for JavaFX apps, FXML layouts, CSS styling, MVVM pattern, Scene Builder, cross-platform desktop. Invoke alongside backend-developer for Quarkus+JavaFX projects."
---

# JavaFX Developer

> **Extends:** backend-developer, frontend-developer
> **Type:** Specialized Skill

## Trigger

Use this skill alongside `backend-developer` or `frontend-developer` when:
- Building JavaFX desktop applications
- Creating FXML layouts and CSS styling
- Implementing MVVM (Model-View-ViewModel) pattern
- Working with Scene Builder for UI design
- Handling JavaFX threading (Platform.runLater)
- Creating cross-platform desktop installers (jpackage)
- Integrating JavaFX with Quarkus or Spring Boot
- Building native images with GraalVM for desktop

## Context

You are a Senior JavaFX Developer with 8+ years of experience building cross-platform desktop applications. You have deep expertise in FXML, CSS styling, the MVVM pattern, and creating polished user interfaces. You understand JavaFX's threading model and how to build responsive applications that don't block the UI thread.

## Expertise

### Versions

| Technology | Version | Notes |
|------------|---------|-------|
| JavaFX | 21+ | LTS with virtual threads support |
| OpenJFX | 21.0.2+ | Open-source JavaFX |
| Java | 21+ | Virtual threads, pattern matching |
| Scene Builder | 21+ | Visual FXML editor |
| jpackage | JDK 21+ | Native installers |
| GraalVM | 23+ | Native image support |
| ControlsFX | 11.2+ | Additional controls |
| Ikonli | 12.3+ | Icon packs |

### Core Concepts

#### Project Setup (Maven with Quarkus)

```xml
<!-- pom.xml -->
<properties>
    <javafx.version>21.0.2</javafx.version>
    <javafx.maven.plugin.version>0.0.8</javafx.maven.plugin.version>
</properties>

<dependencies>
    <!-- JavaFX -->
    <dependency>
        <groupId>org.openjfx</groupId>
        <artifactId>javafx-controls</artifactId>
        <version>${javafx.version}</version>
    </dependency>
    <dependency>
        <groupId>org.openjfx</groupId>
        <artifactId>javafx-fxml</artifactId>
        <version>${javafx.version}</version>
    </dependency>
    <dependency>
        <groupId>org.openjfx</groupId>
        <artifactId>javafx-graphics</artifactId>
        <version>${javafx.version}</version>
    </dependency>

    <!-- ControlsFX for additional controls -->
    <dependency>
        <groupId>org.controlsfx</groupId>
        <artifactId>controlsfx</artifactId>
        <version>11.2.0</version>
    </dependency>

    <!-- Ikonli for icons -->
    <dependency>
        <groupId>org.kordamp.ikonli</groupId>
        <artifactId>ikonli-javafx</artifactId>
        <version>12.3.1</version>
    </dependency>
    <dependency>
        <groupId>org.kordamp.ikonli</groupId>
        <artifactId>ikonli-fontawesome5-pack</artifactId>
        <version>12.3.1</version>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.openjfx</groupId>
            <artifactId>javafx-maven-plugin</artifactId>
            <version>${javafx.maven.plugin.version}</version>
            <configuration>
                <mainClass>uk.selfemploy.app.Launcher</mainClass>
            </configuration>
        </plugin>
    </plugins>
</build>
```

#### Application Entry Point

```java
public class Launcher {
    public static void main(String[] args) {
        // Initialize Quarkus in headless mode
        Quarkus.run(QuarkusApp.class, args);
    }
}

@QuarkusMain
public class QuarkusApp implements QuarkusApplication {

    @Override
    public int run(String... args) {
        // Launch JavaFX on the JavaFX Application Thread
        Application.launch(MainApplication.class, args);
        return 0;
    }
}

public class MainApplication extends Application {

    @Override
    public void start(Stage primaryStage) throws Exception {
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/fxml/main.fxml"));

        // Inject CDI beans into controllers
        loader.setControllerFactory(clazz -> CDI.current().select(clazz).get());

        Parent root = loader.load();
        Scene scene = new Scene(root, 1200, 800);
        scene.getStylesheets().add(getClass().getResource("/css/styles.css").toExternalForm());

        primaryStage.setTitle("UK Self-Employment Manager");
        primaryStage.setScene(scene);
        primaryStage.setMinWidth(800);
        primaryStage.setMinHeight(600);
        primaryStage.show();
    }
}
```

#### MVVM Pattern Implementation

```java
// ViewModel - Business logic and state
@ApplicationScoped
public class DashboardViewModel {

    private final IncomeService incomeService;
    private final ExpenseService expenseService;
    private final TaxCalculator taxCalculator;

    // Observable properties for binding
    private final ObjectProperty<Money> totalIncome = new SimpleObjectProperty<>(Money.ZERO);
    private final ObjectProperty<Money> totalExpenses = new SimpleObjectProperty<>(Money.ZERO);
    private final ObjectProperty<Money> taxableProfit = new SimpleObjectProperty<>(Money.ZERO);
    private final ObjectProperty<Money> estimatedTax = new SimpleObjectProperty<>(Money.ZERO);
    private final ObjectProperty<TaxYear> selectedTaxYear = new SimpleObjectProperty<>();

    private final ObservableList<IncomeRecord> recentIncome = FXCollections.observableArrayList();
    private final ObservableList<ExpenseRecord> recentExpenses = FXCollections.observableArrayList();

    @Inject
    public DashboardViewModel(IncomeService incomeService,
                              ExpenseService expenseService,
                              TaxCalculator taxCalculator) {
        this.incomeService = incomeService;
        this.expenseService = expenseService;
        this.taxCalculator = taxCalculator;

        // React to tax year changes
        selectedTaxYear.addListener((obs, oldVal, newVal) -> refreshData());
    }

    public void refreshData() {
        // Run on background thread, update UI on FX thread
        CompletableFuture.runAsync(() -> {
            TaxYear year = selectedTaxYear.get();
            Money income = incomeService.getTotalForYear(year);
            Money expenses = expenseService.getTotalForYear(year);
            Money profit = income.subtract(expenses);
            TaxCalculation tax = taxCalculator.calculate(profit, year);

            Platform.runLater(() -> {
                totalIncome.set(income);
                totalExpenses.set(expenses);
                taxableProfit.set(profit);
                estimatedTax.set(tax.totalDue());
                recentIncome.setAll(incomeService.getRecentForYear(year, 5));
                recentExpenses.setAll(expenseService.getRecentForYear(year, 5));
            });
        });
    }

    // Property accessors for binding
    public ObjectProperty<Money> totalIncomeProperty() { return totalIncome; }
    public ObjectProperty<Money> totalExpensesProperty() { return totalExpenses; }
    public ObjectProperty<Money> taxableProfitProperty() { return taxableProfit; }
    public ObjectProperty<Money> estimatedTaxProperty() { return estimatedTax; }
    public ObjectProperty<TaxYear> selectedTaxYearProperty() { return selectedTaxYear; }
    public ObservableList<IncomeRecord> getRecentIncome() { return recentIncome; }
    public ObservableList<ExpenseRecord> getRecentExpenses() { return recentExpenses; }
}

// Controller - UI event handling and binding
@Dependent
public class DashboardController implements Initializable {

    @FXML private Label totalIncomeLabel;
    @FXML private Label totalExpensesLabel;
    @FXML private Label taxableProfitLabel;
    @FXML private Label estimatedTaxLabel;
    @FXML private ComboBox<TaxYear> taxYearComboBox;
    @FXML private TableView<IncomeRecord> recentIncomeTable;
    @FXML private TableView<ExpenseRecord> recentExpensesTable;

    @Inject
    private DashboardViewModel viewModel;

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        // Bind labels to ViewModel properties
        totalIncomeLabel.textProperty().bind(
            Bindings.createStringBinding(
                () -> formatMoney(viewModel.totalIncomeProperty().get()),
                viewModel.totalIncomeProperty()
            )
        );

        totalExpensesLabel.textProperty().bind(
            Bindings.createStringBinding(
                () -> formatMoney(viewModel.totalExpensesProperty().get()),
                viewModel.totalExpensesProperty()
            )
        );

        // Bind ComboBox bidirectionally
        taxYearComboBox.valueProperty().bindBidirectional(viewModel.selectedTaxYearProperty());
        taxYearComboBox.setItems(FXCollections.observableArrayList(TaxYear.getAvailable()));
        taxYearComboBox.setValue(TaxYear.current());

        // Bind tables
        recentIncomeTable.setItems(viewModel.getRecentIncome());
        recentExpensesTable.setItems(viewModel.getRecentExpenses());

        // Configure table columns
        setupIncomeTableColumns();
        setupExpenseTableColumns();
    }

    @FXML
    private void onRefreshClicked(ActionEvent event) {
        viewModel.refreshData();
    }

    @FXML
    private void onAddIncomeClicked(ActionEvent event) {
        // Open income dialog
        openDialog("/fxml/dialogs/add-income.fxml", "Add Income");
    }

    private String formatMoney(Money money) {
        return money != null ? String.format("£%,.2f", money.amount()) : "£0.00";
    }
}
```

#### FXML Layout

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.layout.*?>
<?import javafx.scene.control.*?>
<?import javafx.geometry.Insets?>
<?import org.kordamp.ikonli.javafx.FontIcon?>

<BorderPane xmlns="http://javafx.com/javafx/21"
            xmlns:fx="http://javafx.com/fxml/1"
            fx:controller="uk.selfemploy.ui.controller.DashboardController"
            styleClass="dashboard">

    <!-- Top: Header with tax year selector -->
    <top>
        <HBox styleClass="header" alignment="CENTER_LEFT" spacing="20">
            <padding><Insets top="20" right="20" bottom="20" left="20"/></padding>
            <Label text="Dashboard" styleClass="page-title"/>
            <Region HBox.hgrow="ALWAYS"/>
            <Label text="Tax Year:"/>
            <ComboBox fx:id="taxYearComboBox" styleClass="tax-year-selector"/>
            <Button onAction="#onRefreshClicked" styleClass="icon-button">
                <graphic><FontIcon iconLiteral="fas-sync-alt"/></graphic>
            </Button>
        </HBox>
    </top>

    <!-- Center: Main content -->
    <center>
        <ScrollPane fitToWidth="true" styleClass="content-scroll">
            <VBox spacing="20" styleClass="content">
                <padding><Insets topRightBottomLeft="20"/></padding>

                <!-- Summary Cards -->
                <HBox spacing="20" styleClass="summary-cards">
                    <!-- Income Card -->
                    <VBox styleClass="summary-card income-card" HBox.hgrow="ALWAYS">
                        <Label text="Total Income" styleClass="card-label"/>
                        <Label fx:id="totalIncomeLabel" text="£0.00" styleClass="card-value"/>
                        <FontIcon iconLiteral="fas-arrow-up" styleClass="card-icon"/>
                    </VBox>

                    <!-- Expenses Card -->
                    <VBox styleClass="summary-card expenses-card" HBox.hgrow="ALWAYS">
                        <Label text="Total Expenses" styleClass="card-label"/>
                        <Label fx:id="totalExpensesLabel" text="£0.00" styleClass="card-value"/>
                        <FontIcon iconLiteral="fas-arrow-down" styleClass="card-icon"/>
                    </VBox>

                    <!-- Profit Card -->
                    <VBox styleClass="summary-card profit-card" HBox.hgrow="ALWAYS">
                        <Label text="Taxable Profit" styleClass="card-label"/>
                        <Label fx:id="taxableProfitLabel" text="£0.00" styleClass="card-value"/>
                        <FontIcon iconLiteral="fas-chart-line" styleClass="card-icon"/>
                    </VBox>

                    <!-- Tax Card -->
                    <VBox styleClass="summary-card tax-card" HBox.hgrow="ALWAYS">
                        <Label text="Estimated Tax" styleClass="card-label"/>
                        <Label fx:id="estimatedTaxLabel" text="£0.00" styleClass="card-value"/>
                        <FontIcon iconLiteral="fas-calculator" styleClass="card-icon"/>
                    </VBox>
                </HBox>

                <!-- Recent Transactions -->
                <HBox spacing="20">
                    <!-- Recent Income -->
                    <VBox styleClass="table-section" HBox.hgrow="ALWAYS">
                        <HBox styleClass="section-header" alignment="CENTER_LEFT">
                            <Label text="Recent Income" styleClass="section-title"/>
                            <Region HBox.hgrow="ALWAYS"/>
                            <Button text="Add Income" onAction="#onAddIncomeClicked"
                                    styleClass="primary-button"/>
                        </HBox>
                        <TableView fx:id="recentIncomeTable" styleClass="data-table"
                                   VBox.vgrow="ALWAYS"/>
                    </VBox>

                    <!-- Recent Expenses -->
                    <VBox styleClass="table-section" HBox.hgrow="ALWAYS">
                        <HBox styleClass="section-header" alignment="CENTER_LEFT">
                            <Label text="Recent Expenses" styleClass="section-title"/>
                            <Region HBox.hgrow="ALWAYS"/>
                            <Button text="Add Expense" onAction="#onAddExpenseClicked"
                                    styleClass="primary-button"/>
                        </HBox>
                        <TableView fx:id="recentExpensesTable" styleClass="data-table"
                                   VBox.vgrow="ALWAYS"/>
                    </VBox>
                </HBox>
            </VBox>
        </ScrollPane>
    </center>
</BorderPane>
```

#### JavaFX CSS Styling

```css
/* styles.css */

/* Root variables */
.root {
    -fx-primary-color: #2563eb;
    -fx-primary-hover: #1d4ed8;
    -fx-success-color: #10b981;
    -fx-warning-color: #f59e0b;
    -fx-danger-color: #ef4444;
    -fx-background-color: #f8fafc;
    -fx-surface-color: #ffffff;
    -fx-text-primary: #1e293b;
    -fx-text-secondary: #64748b;
    -fx-border-color: #e2e8f0;
    -fx-border-radius: 8px;
    -fx-shadow: dropshadow(gaussian, rgba(0,0,0,0.1), 10, 0, 0, 4);
}

/* Dashboard */
.dashboard {
    -fx-background-color: -fx-background-color;
}

.header {
    -fx-background-color: -fx-surface-color;
    -fx-border-color: -fx-border-color;
    -fx-border-width: 0 0 1 0;
}

.page-title {
    -fx-font-size: 24px;
    -fx-font-weight: bold;
    -fx-text-fill: -fx-text-primary;
}

/* Summary Cards */
.summary-card {
    -fx-background-color: -fx-surface-color;
    -fx-background-radius: -fx-border-radius;
    -fx-border-radius: -fx-border-radius;
    -fx-padding: 20;
    -fx-effect: -fx-shadow;
    -fx-min-height: 120;
}

.summary-card .card-label {
    -fx-font-size: 14px;
    -fx-text-fill: -fx-text-secondary;
}

.summary-card .card-value {
    -fx-font-size: 32px;
    -fx-font-weight: bold;
    -fx-text-fill: -fx-text-primary;
}

.income-card .card-value { -fx-text-fill: -fx-success-color; }
.expenses-card .card-value { -fx-text-fill: -fx-danger-color; }
.profit-card .card-value { -fx-text-fill: -fx-primary-color; }
.tax-card .card-value { -fx-text-fill: -fx-warning-color; }

/* Buttons */
.primary-button {
    -fx-background-color: -fx-primary-color;
    -fx-text-fill: white;
    -fx-font-weight: bold;
    -fx-padding: 10 20;
    -fx-background-radius: 6;
    -fx-cursor: hand;
}

.primary-button:hover {
    -fx-background-color: -fx-primary-hover;
}

.icon-button {
    -fx-background-color: transparent;
    -fx-padding: 8;
    -fx-cursor: hand;
}

.icon-button:hover {
    -fx-background-color: -fx-border-color;
    -fx-background-radius: 4;
}

/* Tables */
.data-table {
    -fx-background-color: -fx-surface-color;
    -fx-border-color: -fx-border-color;
    -fx-border-radius: -fx-border-radius;
}

.data-table .column-header {
    -fx-background-color: #f1f5f9;
    -fx-font-weight: bold;
}

.data-table .table-row-cell:selected {
    -fx-background-color: #dbeafe;
}
```

#### Threading Model

```java
public class ThreadingHelper {

    /**
     * Run a task on a background thread, then update UI on FX thread.
     */
    public static <T> void runAsync(Supplier<T> backgroundTask, Consumer<T> uiUpdate) {
        CompletableFuture.supplyAsync(backgroundTask)
            .thenAcceptAsync(result -> Platform.runLater(() -> uiUpdate.accept(result)));
    }

    /**
     * Run a task on a background thread with progress updates.
     */
    public static <T> Task<T> createTask(Supplier<T> work) {
        return new Task<>() {
            @Override
            protected T call() {
                return work.get();
            }
        };
    }

    /**
     * Show a progress dialog while running a task.
     */
    public static <T> void runWithProgress(Stage owner, String message,
                                           Supplier<T> work, Consumer<T> onSuccess) {
        Task<T> task = createTask(work);

        ProgressDialog dialog = new ProgressDialog(task);
        dialog.initOwner(owner);
        dialog.setTitle("Please Wait");
        dialog.setContentText(message);

        task.setOnSucceeded(e -> {
            dialog.close();
            onSuccess.accept(task.getValue());
        });

        task.setOnFailed(e -> {
            dialog.close();
            showError("Operation failed", task.getException().getMessage());
        });

        new Thread(task).start();
        dialog.showAndWait();
    }
}
```

#### Native Packaging (jpackage)

```xml
<!-- pom.xml - jpackage configuration -->
<plugin>
    <groupId>org.panteleyev</groupId>
    <artifactId>jpackage-maven-plugin</artifactId>
    <version>1.6.0</version>
    <configuration>
        <name>UK Self-Employment Manager</name>
        <appVersion>${project.version}</appVersion>
        <vendor>Self-Employment UK</vendor>
        <destination>target/dist</destination>
        <module>uk.selfemploy.app/uk.selfemploy.app.Launcher</module>
        <runtimeImage>target/jlink-image</runtimeImage>
        <icon>src/main/resources/icons/app-icon.${icon.extension}</icon>
        <javaOptions>
            <option>-Xmx512m</option>
            <option>--enable-preview</option>
        </javaOptions>

        <!-- Windows specific -->
        <winDirChooser>true</winDirChooser>
        <winShortcut>true</winShortcut>
        <winMenu>true</winMenu>
        <winMenuGroup>Self-Employment UK</winMenuGroup>

        <!-- macOS specific -->
        <macPackageIdentifier>uk.selfemploy.app</macPackageIdentifier>
        <macPackageName>Self-Employment UK</macPackageName>

        <!-- Linux specific -->
        <linuxShortcut>true</linuxShortcut>
        <linuxPackageName>self-employment-uk</linuxPackageName>
        <linuxAppCategory>Office</linuxAppCategory>
    </configuration>
</plugin>
```

### GraalVM Native Image for JavaFX

```java
// GraalVM reflection configuration
// src/main/resources/META-INF/native-image/reflect-config.json
[
  {
    "name": "uk.selfemploy.ui.controller.DashboardController",
    "allDeclaredConstructors": true,
    "allPublicMethods": true,
    "allDeclaredFields": true
  },
  {
    "name": "javafx.fxml.FXMLLoader",
    "allDeclaredConstructors": true,
    "allPublicMethods": true
  }
]
```

### Project Structure

```
ui/
├── src/main/
│   ├── java/uk/selfemploy/ui/
│   │   ├── controller/          # FXML controllers
│   │   │   ├── DashboardController.java
│   │   │   ├── IncomeController.java
│   │   │   ├── ExpenseController.java
│   │   │   └── SettingsController.java
│   │   ├── viewmodel/           # ViewModels (MVVM)
│   │   │   ├── DashboardViewModel.java
│   │   │   ├── IncomeViewModel.java
│   │   │   └── ExpenseViewModel.java
│   │   ├── component/           # Reusable UI components
│   │   │   ├── MoneyField.java
│   │   │   ├── DateRangePicker.java
│   │   │   └── CategorySelector.java
│   │   ├── dialog/              # Dialog controllers
│   │   │   ├── AddIncomeDialog.java
│   │   │   └── AddExpenseDialog.java
│   │   └── util/                # UI utilities
│   │       ├── FXMLHelper.java
│   │       └── ThreadingHelper.java
│   └── resources/
│       ├── fxml/                # FXML layouts
│       │   ├── main.fxml
│       │   ├── dashboard.fxml
│       │   ├── income.fxml
│       │   └── dialogs/
│       ├── css/                 # Stylesheets
│       │   ├── styles.css
│       │   ├── components.css
│       │   └── themes/
│       │       ├── light.css
│       │       └── dark.css
│       └── icons/               # Application icons
└── src/test/
    └── java/uk/selfemploy/ui/
        └── controller/          # TestFX tests
```

## Parent & Related Skills

| Skill | Relationship |
|-------|--------------|
| **backend-developer** | Parent skill - invoke for business logic, services |
| **frontend-developer** | Parent skill - invoke for UI patterns |
| **quarkus-developer** | For Quarkus integration, CDI, native builds |
| **ui-designer** | For design specifications, mockups |
| **devops-engineer** | For CI/CD, native packaging, installers |

## Standards

- **MVVM Pattern**: Separate UI logic (Controller) from business logic (ViewModel)
- **FXML**: Use FXML for declarative layouts, avoid programmatic UI
- **CSS**: Use external stylesheets, CSS variables for theming
- **Threading**: Never block UI thread, use Platform.runLater()
- **CDI Integration**: Inject services into ViewModels via CDI
- **Testing**: Use TestFX for UI tests

## Checklist

### Before Implementing UI
- [ ] FXML layout designed (Scene Builder)
- [ ] CSS styles defined
- [ ] ViewModel created with observable properties
- [ ] Controller bindings planned

### Before Release
- [ ] All platforms tested (Windows, macOS, Linux)
- [ ] Native installers created
- [ ] Memory usage profiled
- [ ] Accessibility verified (keyboard navigation, screen readers)

## Anti-Patterns to Avoid

1. **Blocking UI thread**: Always use background threads for I/O
2. **Business logic in Controllers**: Use ViewModels
3. **Hardcoded styles**: Use CSS and themes
4. **No binding**: Manual UI updates instead of property binding
5. **Missing Platform.runLater**: UI updates from background threads
6. **Monolithic FXML**: Break into reusable components
