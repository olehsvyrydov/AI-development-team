# Design — JavaFX Icon & Desktop Solution

## JavaFX Icon Solution (IMPORTANT)

**NEVER use emoji icons in JavaFX** — they don't render reliably:
- Linux: Emojis crash or render as empty boxes
- macOS: After JavaFX 18, emojis render in grey/monochrome

**Use Ikonli instead** — the industry-standard icon library for JavaFX:

```java
// Java
import org.kordamp.ikonli.fontawesome5.FontAwesomeSolid;
import org.kordamp.ikonli.javafx.FontIcon;

FontIcon icon = FontIcon.of(FontAwesomeSolid.FILE_ALT, 20);
icon.setIconColor(Color.WHITE);
label.setGraphic(icon);
```

```xml
<!-- FXML -->
<?import org.kordamp.ikonli.javafx.FontIcon?>
<FontIcon iconLiteral="fas-file-alt" iconSize="20"/>
```

**Common icon mappings:**
| Meaning | FontAwesome Code |
|---------|------------------|
| Document | `fas-file-alt` / `FILE_ALT` |
| Rocket/Start | `fas-rocket` / `ROCKET` |
| Lock/Security | `fas-lock` / `LOCK` |
| Money (GBP) | `fas-pound-sign` / `POUND_SIGN` |
| Check | `fas-check-circle` / `CHECK_CIRCLE` |
| Warning | `fas-exclamation-triangle` / `EXCLAMATION_TRIANGLE` |
| Question | `fas-question-circle` / `QUESTION_CIRCLE` |
| Info | `fas-info-circle` / `INFO_CIRCLE` |

**Resources:**
- [Ikonli Docs](https://kordamp.org/ikonli/)
- [FontAwesome 5 Cheatsheet](https://kordamp.org/ikonli/cheat-sheet-fontawesome5.html)

