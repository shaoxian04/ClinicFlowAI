package my.cliniflow.domain.biz.visit.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * Top-level shape of pre_visit_reports.structured jsonb, written by
 * {@code agent/app/routes/pre_visit.py} / persisted by
 * {@code PreVisitWriteAppService} with exactly these three top-level keys:
 * {@code fields}, {@code history}, {@code done}.
 *
 * Each history item is a {role, content} pair — hence List<Map<String,String>>.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PreVisitStructuredDto(
    PreVisitFieldsDto fields,
    List<Map<String, String>> history,
    Boolean done
) {}
