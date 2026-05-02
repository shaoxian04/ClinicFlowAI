package my.cliniflow.domain.biz.visit.service;

import java.time.LocalDate;

/**
 * Atomic per-day daily-sequence allocator. Returns visit reference numbers
 * shaped {@code V-yyyy-MM-dd-NNNN}. Always called inside an existing transaction
 * (REQUIRED).
 */
public interface ReferenceNumberDomainService {

    String nextFor(LocalDate date);
}
